// `wrangler types` builds Env from wrangler.jsonc's `vars`, which by design
// excludes secrets — VAPID_PRIVATE_JWK is set with `wrangler secret put` (and
// via .dev.vars locally, which is why this gap only shows up in a fresh clone
// or in CI). Declaration-merged onto the generated global interface.
interface Env {
  VAPID_PRIVATE_JWK: string
}
