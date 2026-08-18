---
title: Clone chess.com Game Review in Analysis mode
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Daniel wants Analysis on par with chess.com's Game Review — "clone them."
Grilled 2026-08 into a decided design; this ticket records it and builds it.

## Decisions (grilled, settled)

- **Scope**: accuracy % per player, full move taxonomy on every move, eval
  graph + eval bar, inline retry-your-mistakes. Explicitly out: estimated
  game rating (the milestone ladder owns "measured progress") and per-move
  coach prose on all moves (coach stays evidence-only per 023 — prose stays
  on mistake/blunder only).
- **Math**: lichess's open formulas, not reverse-engineered CAPS2 —
  win% = 50 + 50·(2/(1+e^(−0.00368208·cp)) − 1), per-move accuracy from
  win% drops, game accuracy per lichess's published method, classification
  thresholds from lichess. Numbers will differ a few points from what
  chess.com shows for the same game; documented beats proprietary.
- **Taxonomy**: chess.com's full set — Brilliant !!, Great !, Best,
  Excellent, Good, Book, Inaccuracy ?!, Mistake ?, Miss, Blunder ??.
  Brilliant = played the engine best + it sacrifices material + wasn't
  already trivially winning (material walk along the PV, facts.ts-style).
  Great = only move: second-best loses significantly — needs the analysis
  walk at **MultiPV 2** (same 300ms/position, marginally shallower).
  ANALYSIS_V bumps; cached games re-analyze on next open (~25s each).
- **Book badge**: real theory, not repertoire — vendor the CC0
  lichess/chess-openings TSVs (~3.5k lines) to `public/data/`, match by
  position (EPD). The review names the opening at the top. The existing
  repertoire book-walk sentence stays as its own separate signal.
- **Retry**: inline button on flagged moves — board goes interactive from
  the before-position (reuse the what-if plumbing), success = engine best
  or within ~50cp. No Key-Moments wizard (005 already rejected wizard
  pacing). Own-mistake tactics cards unaffected; retrying doesn't touch
  tactics stats.
- **Skin**: Analysis mode pixel-clones chess.com's visual language — green
  board, their badge colors pinned to destination squares, their eval
  graph. **Analysis only** — the 021 scoresheet identity stays binding
  everywhere else; the map's note gets this carve-out recorded.
- Silent defaults: tactics-card feed unchanged (mistake/blunder only —
  inaccuracies get badges, not cards or prose); both players' accuracy in
  the review header, chess.com-style.

## Scope

`analyze.ts`: MultiPV-2 walk, per-move classification + accuracy, store
shape v5. `Analysis.tsx`: accuracy header, badges on board + move list,
eval graph/bar, inline retry, chess.com skin (mode-scoped styles). Vendor
openings TSVs + EPD matcher. Selftest: classification/accuracy fixtures.
Amend `tracker/map.md`'s identity note.

## Resolution

Built as decided, all green on Selftest and verified live on a real bullet game
(re-analyzed at MultiPV 2, opening named, accuracies 76.0/82.6, badges through
the move list, retry passing/failing correctly, what-if unbroken).

- `analyze.ts` (ANALYSIS_V 5): `winPct`/`moveAcc`/`gameAcc` are lichess's
  formulas (volatility-weighted + harmonic mean); `judgeMoves` grades every ply
  of both players; the 013 card feed (`flagMoves`) keys off tags now — Miss
  deals as a mistake, inaccuracies badge only.
- Brilliant's "wasn't already trivially winning" reads the **second-best**
  eval, not the position eval — a forced-mate sac is ~100% before the move, so
  the best line can't measure "coasting"; MultiPV 2 can.
- `scripts/build-openings.mjs` vendors lichess/chess-openings (CC0) into
  `public/data/openings.tsv` (3,810 rows, EPD-keyed); `openings.ts` walks the
  unbroken theory prefix — a broken chain stays broken, no transposition
  re-entry.
- `Analysis.tsx`: summary (opening, both accuracies, badge counts), eval
  graph (click/drag to seek) + eval bar (flips with orientation), badge SVGs
  pinned to destination squares via chessground `customSvg`, inline retry
  (exact best passes engine-free, else within 50cp at equal depth), all under
  the mode-scoped `.ccr` chess.com skin. Map's identity note carries the
  carve-out.
