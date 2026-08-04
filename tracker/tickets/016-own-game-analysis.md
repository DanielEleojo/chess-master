---
title: Own-game analysis — blunders, rendering, left-book signal
type: prototype
status: closed
assignee: daniel
blocked-by: [011]
---

## Question

Prototype the analysis mode over the 499 imported games (and, once 015 lands, each unseen new game): stockfish.js in a worker walks a game, flags blunders, and renders findings in the 011 shell — Daniel reacts to a working rough take, 005-style.

Open while prototyping:

- blunder threshold and analysis depth/time per move — deep enough to trust, fast enough to feel instant on one game;
- how findings render — annotated move list, board with arrows, a per-game summary card;
- the **left-book-at-move-N signal**: compare the game's opening moves against `data/repertoire.pgn` and record where he (or the opponent) left it — this feeds the opening trainer's miss-driven depth extension (003) and must land somewhere the drill can read;
- blunder spots feed the tactics deck (013) — what shape they're stored in so 013 can deal them.

## Resolution (2026-08-04)

Shipped and reacted to. The analysis mode lives in the shell (home → "Game analysis", unseen-count badge): `src/lib/engine.ts` (stockfish-18-lite-single worker, serial UCI, PV capture), `src/lib/analyze.ts` (knobs at top), `src/modes/Analysis.tsx`. Results persist to `data/analysis.json` keyed by uuid with a `v`/`ms` stamp (stale/shallow caches re-analyze) — each blunder carries `{ply, san, fen-before, best, bestSan, pvSan, swingCp, severity}` (the 013 card shape) and `book` is the left-book signal for 003 (`{line, matchedPlies, leftAtPly, by: me|opp, expectedSan}`). Opening a game clears its uuid from `sync-state.json` unseen.

Daniel's reactions, folded in:
- "far too shallow" → 300ms/position (~depth 16+), version-stamped re-analysis;
- misses under-explained everywhere → every repertoire user move and trap card now carries an authored why-comment (selftest-enforced), flagged moves show the PV;
- PV-as-explanation rejected ("tell me why my move breaks my position") → graduated into the coach effort: tickets 017 (explanation engine — fact layer + coach voice) and 018 (coach recommender + milestone ladder). Decisions in CONTEXT.md and ADR 0001.

Open reactions not pursued now: batch analyze-all-new, eval sparkline, missed-punish flagging — revisit inside 017/018 if wanted.
