---
title: Build the coach push notifications
type: task
status: closed
assignee: baba
blocked-by: [026]
---

## Question

Implement 026's decided design end-to-end:

- **Client**: `src/lib/push.ts` — permission-gated subscribe helper (`Notification.permission === 'default'` only), registers a service worker, subscribes via `PushManager` with a VAPID public key, PUTs the subscription to the account's KV via the existing generic `/api/data/:name` route. A small link near `CoachCard` on Home offers it.
- **Service worker**: `public/sw.js` — `push` shows a plain-fact notification, `notificationclick` focuses/opens the app.
- **Worker**: a daily Cron Trigger (`scheduled` handler in `worker/index.ts`) iterates accounts (KV uid prefixes), checks each one's last drill session against the 5-day inactivity signal, and sends a push once per crossing — never repeating while still quiet, resetting only once a new session lands.
- **Crypto**: RFC 8291 (`aes128gcm`) payload encryption + RFC 8292 (VAPID) JWT auth, since the zero-dependency Workers-compatible packages available today implement the legacy pre-standard `aesgcm` scheme instead.

## Resolution

Shipped end-to-end; verified live both cryptographically and inside the real Workers runtime.

- **`worker/push.ts`**: hand-rolled RFC 8291 encryption + RFC 8292 VAPID JWT against Workers' native `crypto.subtle` — ~120 lines. Rejected `@block65/webcrypto-web-push` and `pushforge` (both implement the legacy draft-04 `aesgcm` content-encoding, which current browsers are dropping per Baseline 2025) and the one RFC-8291-compliant package found (`@mmmike/web-push`, a brand-new single-star repo) as too great a correctness risk for a security-sensitive path to hand off to an unvetted dependency. **Verified against RFC 8291 Appendix A's published test vectors byte-for-byte** (shared secret, IKM, CEK, nonce, header, and ciphertext all match exactly — see the throwaway `rfc8291-check.mjs` run during this session) and the VAPID JWT's ECDSA sign→verify round-trips with a 64-byte raw r‖s signature (JWS ES256 shape, not DER).
- **Worker types quirk found**: workerd's generated `SubtleCryptoDeriveKeyAlgorithm` ambient type names the ECDH field `$public`, but the runtime (confirmed against Cloudflare's own docs example) still reads `public` — the code passes `public` with a type-only cast, commented in place so a future "helpful" fix doesn't rename it to match the (wrong) type.
- **`worker/index.ts`**: `pushAccount()` reads `{uid}/push-subscription` + `{uid}/drill-history` from KV, compares against `PUSH_INACTIVITY_DAYS = 5` (duplicated from `recommend.ts`'s `INACTIVITY_DAYS`, same split as the existing `COACH_MODEL`/`MODEL` duplication across the worker/client boundary), and guards re-sends via `{uid}/push-state`'s `lastPushAt` compared to the session timestamp. A 404/410 response from the push service deletes the stored subscription. `listAccounts()` lists the whole `DATA` namespace once and groups by uid prefix — fine at today's account count, revisit with a maintained index if that changes. New daily Cron Trigger (`0 0 * * *`) in `wrangler.jsonc`.
- **`src/lib/push.ts` / `public/sw.js` / `src/App.tsx`**: subscribe helper, minimal service worker (push + notificationclick only, no offline caching), and a "Notify me if I go quiet →" link in Home's footer next to the selftest link, gated on `Notification.permission === 'default'`.
- **VAPID keys**: generated once via Node's `crypto.subtle`; public half lives in `wrangler.jsonc`'s `vars` (not secret) and is duplicated as a literal in `src/lib/push.ts` (client can't read Worker vars); private JWK is a Worker secret, supplied locally via a gitignored `.dev.vars`.
- **Verified live** inside the actual Workers runtime via `wrangler dev --test-scheduled` (temporarily routing `/__scheduled` through `run_worker_first` to reach it, reverted after): seeded a 6-day-stale session + a real subscription pointed at `httpbin.org`, confirmed (1) the cron sends and records `push-state` on first crossing, (2) a second cron run does **not** re-send while still quiet, and (3) a `410` response correctly deletes the stored subscription. `npm run check` clean (both tsc configs).
- **Known gap**: the browser-side grant→subscribe happy path (`Notification.requestPermission()` actually resolving `'granted'`) couldn't be driven from this session's automated browser profile, which has notifications pre-set to `'denied'` (a state JS can't reset). What *was* verified: the link correctly hides when permission isn't `'default'`, `subscribeToPush()` degrades to `false` without throwing when permission is denied, the service worker registers and activates cleanly, and the subscription PUT round-trips through the existing `/api/data/push-subscription` route. Daniel should click the new Home link once on his real laptop browser to complete that last leg.
