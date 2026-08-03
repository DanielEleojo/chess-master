---
title: Build the v1 shell — scaffold, board, opening drill on real seeds
type: task
status: open
assignee:
blocked-by: [004, 005, 010]
---

## Question

Stand up the app decided in 004 and make it trainable: port the drill flow decided in 005 onto the real seed data from 010. Done when `npm run dev` opens a page where Daniel can run a blended line drill and trap puzzle cards against `data/repertoire.pgn` / `data/traps.pgn`.

Checklist:

- **Daniel first (HITL step)**: upgrade Node to 22+ LTS via pacman — npm 12 requires it (004).
- Scaffold Vite `react-ts`; add chessground, chess.js, stockfish from npm (002's picks).
- `vite.config.ts` middleware: `GET/PUT /api/data/<name>` ↔ `data/*.json` (004).
- One chessground wrapper component (ref/effect; DIY promotion picker per 002).
- Port the drill engine from `prototypes/drill-flow.html` as plain modules: blended line drill (endless streak pacing, explain-why-on-miss, miss requeue) + fast puzzle cards from traps.pgn (005).
- Drill history persists to `data/` via the middleware.

Not in scope: sync loop (006 designs it first), engine sparring, analysis, lichess puzzle filtering (tactics mode, still fog). If 012 (watch-first intro pass) is resolved by build time, honor it; otherwise default to no intro pass — misses teach, per 005's philosophy.
