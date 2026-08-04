---
title: Tactics mode — filter lichess puzzles into his-repertoire decks
type: task
status: closed
assignee: claude
blocked-by: [011]
---

## Question

Build the tactics surface: an offline Python script (established pattern: `scripts/`) filters the CC0 `lichess_db_puzzle.csv.zst` (6.06M rows, 002) into a `data/puzzles.json` the card surface from 011 can deal — Rating roughly 600–1300, beginner themes, `OpeningTags` matching his three systems (Italian / Caro-Kann / Slav) plus the `attackingF2F7`-flavored junk themes (008's cross-link).

Decide while building, Daniel reacting to a working deal (005-style):

- difficulty band — fixed, or tracking his results;
- deck size and cards per session;
- how multi-move puzzles fit the one-move card shell from 011 — extend the card into a mini-drill (the trap-line mechanics already exist), or start one-move-only.

## Resolution

Tactics ships as a **third mode on home**, dealing from **two sources into one deck** — that second source is the ticket's real find: his own flagged moves are the best puzzles he owns, and they were already sitting in `analysis.json` in the exact shape a card needs (016 stored `fen` = position before the move, plus `best`).

**The pipeline** — `scripts/build-puzzles.py`: streams the 6.1M-row CC0 dump (auto-downloads the 300 MB `.zst`, gitignored) and writes `data/puzzles.json`, 360 puzzles / 82 KB, committed as a seed like the PGNs. 20s, deterministic, every filter a knob at the top of the file. Twelve decks × 30: his three systems (Italian / Caro-Kann / Slav), the `attackingF2F7` junk smash (008's cross-link), then fork / pin / skewer / hanging piece / discovered attack / back-rank mate / mate-in-1 / mate-in-2. Quality gate `Popularity ≥ 80 && NbPlays ≥ 200`; candidates were never the constraint (16k Italian, 16k Caro-Kann, 3.5k Slav, 183k forks in band), so picking is deliberately fussy. Each deck takes its 30 spread evenly across the rating range rather than by popularity, so a deck has easy and hard cards instead of the same famous ones.

**The three decisions**, all confirmed by Daniel against the working deal:

- **Difficulty: fixed band, 600–1300.** No puzzle rating tracked, no adaptive pull. Weakest-first ordering (`byWeakness`, shared with lines and traps) already brings missed cards back first; when he outgrows the band it's one constant and a rerun. Adaptive difficulty is machinery that guesses until ~100 attempts exist anyway.
- **Deal: 10 cards, up to 4 his own.** A fixed own-quota, because 21 real mistakes can't compete with 360 puzzles on weakness ranking alone. Both are exported knobs (`DEAL`, `OWN_QUOTA`).
- **Card length: up to 2 of his moves** — mini-drill, not one-move-only. `oneMove` + `short` puzzles only; `long`/`veryLong` filtered out.

**How it reuses what exists.** A `Line` gained an optional `fen` start and `makeDrill` starts from it — two lines, and the entire 005 drill engine now walks puzzles. A puzzle becomes a fen-rooted Line whose ply 0 is the opponent's move into the shot (highlighted, so the position lands with context) and the user takes over at ply 1; an own-mistake card starts at ply 0 on his turn. The card surface is a sibling of `TrapCards` rather than a generalization of it — the shared parts were already libraries (`makeDrill`, `byWeakness`, `Board`, `fx`), and the genuine delta (a correct move is answered on the board, then he must find the follow-up) was cheaper than six flags through the trap shell.

**Why on a miss.** Own-mistake cards get 017's fact layer computed from what analysis already stored — instant, deterministic, no engine and no LLM (a card deal is a sprint, not a lecture): *"Qxg5 was there. Nothing hangs — the cost is positional…"*. Lichess cards name the motif and the full solution line. Misses requeue in-deal like traps, and 012's grace covers the first-ever attempt.

**Claiming the blunder-cluster rung** (the fog note on the map, and the `ponytail:` TODO left in `recommend.ts` by 018): a non-opening blunder cluster now picks `mode: 'puzzles', ownOnly: true` — "Redo your middlegame blunders" deals *only* his own positions instead of re-opening analysis. Opening clusters still route to the line drill, where they belong. `weak-drill` also sweeps the new `history.puzzles` bucket.

**Verified live**, not just typechecked: selftest all green with 10 new checks (all 360 cards walk their own solution through the drill engine; every card starts on his turn; nothing exceeds 2 moves; own-quota and deep-link deal composition). Then a real deal driven end to end in the browser — 4 own cards + 6 lichess, a deliberate miss showing the fact-layer why and requeueing, a mate-in-2 playing `g5+` → `Kh5` appears → `Qg6#`, finishing 9/10 with `history.puzzles` and the session log persisted.

Files: [scripts/build-puzzles.py](../../scripts/build-puzzles.py), [src/lib/puzzles.ts](../../src/lib/puzzles.ts), [src/modes/Puzzles.tsx](../../src/modes/Puzzles.tsx), [data/puzzles.json](../../data/puzzles.json).
