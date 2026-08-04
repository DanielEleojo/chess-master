// Push notifications for the coach (ticket 026): opt-in link on Home, gated
// on Notification.permission being unasked. Public key duplicated in
// wrangler.jsonc's VAPID_PUBLIC_KEY var — it's not secret, and client/Worker
// are separate bundles (same split as coach.ts's MODEL / worker's COACH_MODEL).
const VAPID_PUBLIC_KEY = 'BPjBKFvRnW4RE3Gyf-0HnQCJDn82j9hOKUNN4r7GDMKI6RCF_uNyI5Om0yl_IDFYaB0Os6ADAkRTW4-kto58ULk'

function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = base64url + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(pad.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushOfferable(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Notification.permission === 'default'
  )
}

export async function subscribeToPush(): Promise<boolean> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  const reg = await navigator.serviceWorker.register('/sw.js')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  await fetch('/api/data/push-subscription', { method: 'PUT', body: JSON.stringify(sub) })
  return true
}
