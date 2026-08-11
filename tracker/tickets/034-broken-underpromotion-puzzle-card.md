---
title: Tactics card p:Oezqb doesn't walk its own solution
type: task
status: closed
assignee: claude
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

## Resolution

The UCI→SAN conversion this ticket scoped toward was a red herring:
`src/lib/puzzles.ts`'s `uciLine` already passes `promotion: u.slice(4) ||
undefined` into `chess.move(...)`, and chess.js's `.history({verbose:
true})` correctly records the underpromotion on the resulting `Move` —
`p:Oezqb`'s `Line` already carried `f1=N`, not `f1=Q`, going in.

The actual bug was one layer up, in the shared drill engine every mode
walks: `src/lib/drill.ts`'s `tryMove` tries a bare `{from, to}` first, and
on a promotion square that throws (chess.js needs the promotion hint), so
it retries with a hardcoded `promotion: 'q'` — always queen, regardless of
what the line's own expected move actually promotes to. For `p:Oezqb` that
forced `f1=Q`, which never matches the expected `f1=N`, so the card could
never be completed as scripted. Fixed by reading the promotion piece off
the expected move itself: `promotion: exp.promotion ?? 'q'` (queen only
stays the default for a from/to that isn't a promotion at all).

One-line fix, `src/lib/drill.ts`'s `tryMove` only — `build-puzzles.py` and
`puzzles.ts` untouched, since neither was ever broken. Verified via
Selftest: `every tactics card walks its own solution` now passes for
`p:Oezqb` along with the rest of the deck.
