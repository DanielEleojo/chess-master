// Push notifications for the coach (ticket 026): a doorbell, not the message —
// payload is a plain fact, tapping it opens Home where CoachCard already
// computes the real evidence-backed pitch (recommend.ts + coach.ts).
//
// ponytail: hand-rolled RFC 8291 (aes128gcm) + RFC 8292 (VAPID) instead of a
// dependency. The zero-dep Workers-compatible packages found (block65,
// pushforge) both implement the legacy draft-04 "aesgcm" scheme, which current
// browsers are dropping in favour of aes128gcm (Baseline 2025); the one
// RFC-8291 package found was a brand-new single-star repo. This is ~120 lines
// against Workers' native crypto.subtle, not a wheel worth reinventing badly.

const b64url = (buf: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const unb64url = (s: string): Uint8Array => {
  const pad = s + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

async function vapidJwt(privateJwk: JsonWebKey, endpoint: string, subject: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  }
  const enc = new TextEncoder()
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(signingInput),
  )
  return `${signingInput}.${b64url(sig)}`
}

// RFC 8291 §3.4: derive CEK + nonce from the ECDH shared secret, the
// subscription's auth secret, and a per-message salt; encrypt as one record.
async function encryptRecord(
  sub: PushSubscription,
  plaintext: Uint8Array,
): Promise<{ body: Uint8Array; salt: Uint8Array; serverPublicRaw: Uint8Array }> {
  const uaPublicRaw = unb64url(sub.keys.p256dh)
  const authSecret = unb64url(sub.keys.auth)
  const uaPublicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64url(uaPublicRaw.slice(1, 33)), y: b64url(uaPublicRaw.slice(33, 65)), ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const serverKeyPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const serverPublicRaw = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)) as ArrayBuffer,
  )
  // workerd's ambient type misnames this field $public (see SubtleCryptoDeriveKeyAlgorithm in
  // worker-configuration.d.ts); the runtime — per Cloudflare's own docs — still reads `public`.
  const ecdhSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
    serverKeyPair.privateKey,
    256,
  )

  const enc = new TextEncoder()
  const authInfo = concat(enc.encode('WebPush: info\0'), uaPublicRaw, serverPublicRaw)
  const ikmKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: authInfo },
    ikmKey,
    256,
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prkKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') },
    prkKey,
    128,
  )
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') },
    prkKey,
    96,
  )
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt'])

  const padded = concat(plaintext, new Uint8Array([0x02])) // single-record delimiter, no extra padding
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, padded),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  const header = concat(salt, recordSize, new Uint8Array([serverPublicRaw.length]), serverPublicRaw)
  return { body: concat(header, ciphertext), salt, serverPublicRaw }
}

export async function sendPush(
  sub: PushSubscription,
  text: string,
  vapid: { subject: string; publicKey: string; privateJwk: JsonWebKey },
): Promise<Response> {
  const { body } = await encryptRecord(sub, new TextEncoder().encode(text))
  const jwt = await vapidJwt(vapid.privateJwk, sub.endpoint, vapid.subject)
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  })
}
