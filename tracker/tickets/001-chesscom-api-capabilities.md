---
title: What can the chess.com API actually give us?
type: research
status: closed
assignee: daniel
blocked-by: []
---

## Question

What does the chess.com public API offer for pulling Daniel's games, and how fast can a finished game reach Chess Master?

Specifically:
- Endpoints for player game archives and any live/current-game endpoints.
- How quickly a finished game appears in the archives (latency matters — the goal is near-instant sync).
- Rate limits and polite-polling guidance.
- What the returned PGN/JSON carries: accuracy scores, ECO/opening, clocks, result details.
- Any signal faster than polling monthly archives (e.g. `is-playing` style endpoints, unofficial-but-stable endpoints worth knowing about — flag stability risk).

Unblocks: stack decision (004), sync design (006).

## Resolution

Full findings: [research/001-chesscom-api.md](../../research/001-chesscom-api.md). Key facts (verified live against api.chess.com, not just docs):

- The monthly archive `GET api.chess.com/pub/player/{user}/games/{YYYY}/{MM}` is the **only** source for finished live games — `/games` and `/games/to-move` are Daily-chess-only, and there is no in-progress-live-game endpoint.
- **Latency is fine for "instant"**: docs carry stale 12h/24h caching boilerplate, but live headers show `Cache-Control: max-age=5` on the archive with working ETag/`If-None-Match` 304 support. Finished games appear within seconds; tight conditional polling is the sanctioned fast path.
- Rate limits: serial requests officially unlimited; parallel risks 429. Send a User-Agent with contact info.
- Game JSON carries PGN with per-move `%clk` clocks, `accuracies` (only when Game Review ran), `eco` URL, `time_class`, `rated`, `end_time`, `uuid`, and a documented result-code table.
- Faster-than-polling signals: `/is-online` is dead (404). Profile `last_online` is the official coarse presence signal; the unofficial `www.chess.com/callback/user/popup/{user}` works today but is high stability risk.
- **Recommended sync design**: adaptive serial polling of the current-month archive with ETag conditional requests — 5–15s while Daniel is active, backing off when idle.
