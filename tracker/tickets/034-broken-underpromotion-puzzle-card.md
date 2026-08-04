---
title: Tactics card p:Oezqb doesn't walk its own solution
type: task
status: open
assignee:
blocked-by: []
---

## Question

Surfaced by Selftest while resolving [028](028-selftest-crash-on-load.md)
(unrelated to that fix — pre-existing): `FAIL every tactics card walks its
own solution (p:Oezqb)`.

The card is `public/data/puzzles.json`'s `Oezqb` entry (deck `mate2`, fen
`3Rr2R/6k1/p7/1p3Pb1/4p1P1/P5K1/1Pr2p2/8 w - - 12 46`, moves `d8e8 f2f1n
g3h3 c2h2`, rated 1643). Its solution's second ply, `f2f1n`, is an
underpromotion (pawn → knight, lichess's trailing-letter UCI suffix).
Likely `makeDrill`/the puzzle-card builder (`src/lib/puzzles.ts`) doesn't
carry the promotion piece through when converting this card's moves into a
`Line`, so the walk plays a different (queen?) promotion than the recorded
solution and the card can never be completed as scripted.

## Scope

Find where puzzle UCI moves get turned into a `Line`'s SAN move list
(`build-puzzles.py` and/or `src/lib/puzzles.ts`/`pgn.ts`) and confirm
underpromotion suffixes survive that conversion. Fix there, or — if
`build-puzzles.py`'s dump has other underpromotion cards with the same gap
— filter them at build time instead, whichever is cheaper. Selftest's
existing `every tactics card walks its own solution` check is the pass/fail
signal; no new check needed.
