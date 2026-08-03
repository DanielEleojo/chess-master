---
title: What can the chess.com API actually give us?
type: research
status: open
assignee:
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
