---
title: Build the line extension mechanism
type: task
status: open
assignee:
blocked-by: []
---

## Question

Implement 019's decided mechanism end-to-end:

- **Signal**: extend `bookWalk`/`Analysis` so opp-departures carry the opponent's actually-played move at the break, and outlived-book (`ended` with the game continuing) is distinguishable from line-covered-it-all. Bump `ANALYSIS_V`.
- **Coach rung**: new extension rung in [recommend.ts](../../src/lib/recommend.ts) — opp-left same line ≥2× → propose branch; outlived same line ≥2× → propose tail. Proposal = opponent's majority real move + Stockfish best replies (deeper than analysis's 300ms), 4 plies, length as an exported knob.
- **Card UX**: proposal renders on the Coach says card with the moves and why; one-click accept / dismiss.
- **Accept**: append the plies into `data/repertoire.pgn` (branch or tail), store the line's pre-extension length so 012's grace covers first misses on new plies.
- **Dismiss**: persist (line, break ply, opponent move); re-propose only when a new game re-hits the same break.
- Selftest coverage for the new signal shape, rung, grace-on-tail, and PGN append.
