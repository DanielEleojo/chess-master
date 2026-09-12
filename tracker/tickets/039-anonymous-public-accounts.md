---
title: Public visitors without Cloudflare Access collide into one account
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Raised while getting the repo ready for the public: `worker/index.ts`'s
`accountId()` trusts the `Cf-Access-Authenticated-User-Email` header Cloudflare
Access injects, and falls back to a single literal `'dev@local'` when that
header is absent. Access is a Zero Trust feature — configuring it isn't
something a random visitor, or a fork's owner who just wants to try the
site, does. So the actual behavior of `npm run deploy` with no further setup
is: every visitor who ever opens the site reads and writes the *same* KV
account — one shared repertoire, drill history, and chess.com username. The
README already carried an `[!IMPORTANT]` callout warning about exactly this,
which is a sign the gap should be closed rather than just documented.

## Resolution

`accountId()` now returns `{ uid, setCookie? }`: Access's header still wins
when present; otherwise it reads an existing `uid` cookie, and only mints a
fresh `crypto.randomUUID()` (with a `Set-Cookie` to remember it, `SameSite=Lax`,
`HttpOnly`, 400-day `Max-Age` — Chrome's own cap) on a visitor's actual first
request. `fetch()` in `worker/index.ts` now runs the existing routing logic
(pulled out as `route()`, unchanged) and appends the `Set-Cookie` to whatever
response comes back, rebuilding it first since `env.ASSETS.fetch()` responses
are immutable.

No client-side change needed — cookies ride along on every same-origin
`fetch()` call already in `src/lib`. Every KV route was already uid-prefixed
(from the earlier Access-only design), so isolation was one function away.

Cloudflare Access is now optional rather than load-bearing: it upgrades an
anonymous per-browser account into a real login that follows a person across
devices, but a public deploy is safe without it. Updated the README's
"Deploying your own" section and the stale `ticket ???` comments in
`worker/index.ts` and `src/lib/account.ts` accordingly.

Verified with `wrangler dev`: a request with no cookie gets a `Set-Cookie: uid=...`
back and its data lands under that uid in KV; a repeat request with that
cookie reuses the same uid and no new `Set-Cookie`; a request carrying the
Access header ignores any cookie and uses the email instead.
