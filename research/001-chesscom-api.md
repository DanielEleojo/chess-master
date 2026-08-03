# Research 001: Chess.com Published-Data API (PubAPI) for near-instant game sync

Date: 2026-08-03. Sources: official PubAPI docs ([chess.com/news/view/published-data-api](https://www.chess.com/news/view/published-data-api), last updated 2026-04-22), [support article](https://support.chess.com/en/articles/9650547-published-data-api), plus live header/response inspection of `api.chess.com` performed 2026-08-03 (noted as "verified" below).

## TL;DR — recommended sync approach

- Poll the **current month archive** `GET /pub/player/{user}/games/{YYYY}/{MM}` with `If-None-Match` (ETag). Verified: the endpoint serves `Cache-Control: public, max-age=5` behind Cloudflare, so finished live games are effectively available within seconds, not the "12/24 hours" boilerplate in the docs.
- Poll **serially** (never in parallel) — serial rate is officially unlimited; parallel requests can 429. A 5–15 s serial poll loop with conditional requests (mostly cheap 304s) is compliant and near-instant.
- Send a **User-Agent with contact info** (e.g. `chess-master/0.1 (contact: you@example.com)`) so Chess.com contacts you instead of silently blocking.
- Gate polling frequency on activity: official profile `last_online` (and the archive's own `Last-Modified`) as coarse signals; the documented `/is-online` endpoint is **dead (404, verified)**. Unofficial `www.chess.com/callback/...` endpoints exist but are unsupported — use only as an optional optimization.
- The archive JSON already carries everything the trainer needs: PGN **with `%clk` per-move clocks** (verified), `accuracies`, `eco` opening URL, `time_class`, `time_control`, `rated`, result codes, player `uuid`s. No second fetch per game needed.

## 1. Endpoints

Docs: "There are six endpoints for a player's games" ([source](https://www.chess.com/news/view/published-data-api)):

| Endpoint | Returns |
|---|---|
| `GET https://api.chess.com/pub/player/{user}/games/archives` | Array of monthly-archive URLs, ascending chronological order |
| `GET .../games/{YYYY}/{MM}` | "Array of Live and Daily Chess games that a player has finished" that month (game-end month), ascending `end_time` order |
| `GET .../games/{YYYY}/{MM}/pgn` | Same month as one multi-game PGN file (`Content-Type: application/x-chess-pgn`) |
| `GET .../games` | "Array of Daily Chess games that a player is currently playing" — **Daily (correspondence) only**; empty for live-only players (verified). Extra fields: `turn`, `move_by` (0 if on vacation), `draw_offer`, `last_activity` |
| `GET .../games/to-move` | "Array of Daily Chess games where it is the player's turn to act" — Daily only, concise format, sorted by urgency; may include non-turn games with pending draw offers |
| `GET .../games/live/{BASETIME}/{INCREMENT}` | Finished Live games filtered by time control (e.g. `/games/live/180/2`) |

There is **no endpoint for a live (blitz/rapid/bullet) game in progress** — live games only surface after they finish, in the monthly archive.

## 2. Latency and caching (the critical question)

What the docs say (contradictory boilerplate):
- Top-of-page caveat: "Cache invalidation: This endpoints refresh at most once every 12 hours."
- Caching section: "Please note: The endpoints refresh at most once every 24 hours, if not noted otherwise." Per-endpoint notes override this (e.g. streamers "refreshes every 5 minutes", leaderboards refresh on update; club members / country players carry the 12-hour note). The **game archive endpoints carry no refresh note of their own**.
- The other freshness caveat is about legacy v2-website users (~3%), whose actions "may be out of date when we deliver it to you" — being phased out.

What the API actually does (verified 2026-08-03 against `hikaru`'s current-month archive):
- `cache-control: public, max-age=5` on `/games/{YYYY}/{MM}`; `max-age=60` on `/games/archives`. `cf-cache-status: REVALIDATED` — Cloudflare CDN revalidates against origin after max-age, exactly as the docs' Caching section describes ("HIT", "MISS", "EXPIRED", "REVALIDATED").
- So the *edge cache* holds an archive response for at most ~5 seconds. Real-world tooling (and the developer-community forums) consistently see finished live games in the current-month archive within seconds to ~1 minute. Treat the "12/24 h" lines as stale worst-case boilerplate, not the archive's behavior — but don't build a hard SLA on it; nothing official promises a number.
- **Conditional requests officially supported and verified**: "Each response has ETag and Last-Modified headers. If your client supplies … If-None-Match and If-Modified-Since … you will receive a 304 Not Modified." A test request with `If-None-Match` returned HTTP 304. ETags are weak (`W/"…"`); prefer ETag over `Last-Modified` (observed `last-modified` values move with regeneration, not only with data changes).

## 3. Rate limits and polite polling

Official statements ([docs](https://www.chess.com/news/view/published-data-api), [support article](https://support.chess.com/en/articles/9650547-published-data-api)):
- "Your serial access rate is unlimited. If you always wait to receive the response to your previous request before making your next request, then you should never encounter rate limiting."
- Parallel requests "may be blocked depending on how much work it takes to fulfill your previous request. You should be prepared to accept a '429 Too Many Requests' response … for any non-serial request." (Note: HTTP/2 multiplexing still counts as parallel.)
- "If we detect abnormal or suspicious activity, we may block your application entirely. If you supply a recognizable user-agent that contains contact information … we will attempt to contact you." Support article example: `User-Agent: my-profile-tool/1.2 (username: your_username; contact: me@example.com)`.
- Response codes: 200, 301 (follow + remember), 304 (cache valid), 404 (bad URL/no such user), 410 (never retry), 429 (rate-limited).

Practical guidance: one request in flight at a time per client; on 429 back off (a few seconds) and resume serially; always send `If-None-Match`; gzip is supported and worthwhile.

## 4. What the game JSON/PGN carries

Monthly-archive Game object (documented + verified observed fields):
- `white` / `black`: `username`, `rating` (post-game), `result` (code, see below), `@id` (profile URL), `uuid` (member ID).
- `accuracies`: `{white: float, black: float}` — only "if they were previously calculated" (i.e. someone ran Game Review); absent otherwise. You cannot trigger calculation via PubAPI.
- `pgn`: full PGN — for live games includes `[%clk h:mm:ss.t]` annotations on every move (verified), i.e. per-move clock times. Headers include ECOCode/ECOUrl, result, etc.
- `eco`: URL to the named opening (e.g. `https://www.chess.com/openings/Benoni-Defense-…`).
- `url`, `fen` (final position), `uuid` (game ID), `tcn` (compact move encoding, undocumented), `initial_setup`, `rated` (bool), `tournament` / `match` URLs when applicable.
- `time_class`: `daily` | `rapid` | `blitz` | `bullet`; `time_control`: PGN-standard (e.g. `180+2`); `rules`: `chess`, `chess960`, `bughouse`, `kingofthehill`, `threecheck`, `crazyhouse`.
- `start_time` (Daily games only) and `end_time` (Unix seconds) — `end_time` is the natural sync cursor.

Result codes (per side): `win`, `checkmated`, `agreed`, `repetition`, `timeout`, `resigned`, `stalemate`, `lose`, `insufficient`, `50move`, `abandoned`, `kingofthehill`, `threecheck`, `timevsinsufficient`, `bughousepartnerlose`. Derive W/D/L: `win` = won; draw codes = `agreed/repetition/stalemate/insufficient/50move/timevsinsufficient`; everything else = loss.

## 5. Faster-than-polling signals

- **`/pub/player/{user}/is-online`** — still documented ("Tells if an unser has been online in the last five minutes") but **returns 404 `Data provider not found` (verified 2026-08-03)**. Long-dead; do not build on it.
- **Official coarse presence**: profile `GET /pub/player/{user}` includes `last_online` (timestamp of last login) — good for deciding when to poll faster, not for "is playing now".
- **No official push**: no webhooks, no WebSocket, no server-sent events in PubAPI ("read-only REST API").
- **Unofficial (unsupported, may change/blocked at any time — stability risk HIGH):**
  - `https://www.chess.com/callback/user/popup/{user}` — works without auth (verified); returns `lastLoginDate`, membership, ratings. Same-origin website API, not versioned, occasionally gated by Cloudflare bot checks.
  - Other `/callback/...` routes (e.g. `member/stats`, game callbacks) and the live-chess WebSocket used by the web client can show games in progress in real time, but they are undocumented, unauthenticated-hostile, and plausibly against ToS for third-party apps. Do not make the product depend on them.
- **Conclusion**: given `max-age=5` + free 304s + unlimited serial rate, tight conditional polling of the current-month archive *is* the sanctioned "fast path". Adaptive schedule: idle (last_online stale) → poll every few minutes; active → every 5–15 s; after a new game lands → burst-check for follow-up games.

## Open questions / risks

- No official SLA on archive freshness; the "12/24 h" boilerplate gives Chess.com cover to slow it down. Mitigation: design sync as eventually-consistent; latency is UX polish, not correctness.
- `accuracies` presence is nondeterministic (depends on Game Review having run) — the app needs its own analysis fallback.
- PubAPI is public-data only and read-only; anything requiring auth (chat, conditional moves, triggering analysis) is out of scope.
