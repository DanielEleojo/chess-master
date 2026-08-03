---
title: Own-game analysis — blunders, rendering, left-book signal
type: prototype
status: open
assignee:
blocked-by: [011]
---

## Question

Prototype the analysis mode over the 499 imported games (and, once 015 lands, each unseen new game): stockfish.js in a worker walks a game, flags blunders, and renders findings in the 011 shell — Daniel reacts to a working rough take, 005-style.

Open while prototyping:

- blunder threshold and analysis depth/time per move — deep enough to trust, fast enough to feel instant on one game;
- how findings render — annotated move list, board with arrows, a per-game summary card;
- the **left-book-at-move-N signal**: compare the game's opening moves against `data/repertoire.pgn` and record where he (or the opponent) left it — this feeds the opening trainer's miss-driven depth extension (003) and must land somewhere the drill can read;
- blunder spots feed the tactics deck (013) — what shape they're stored in so 013 can deal them.
