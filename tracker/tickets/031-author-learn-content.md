---
title: Author the Learn content — data/learn.json
type: task
status: closed
assignee: claude
blocked-by: [030]
---

## Question

Write `data/learn.json` per 030's decision:

- A system brief (plans, typical pawn breaks, key squares — text only) for
  each of the three systems: Italian, Caro-Kann, Slav.
- A longer explanation for every move in `data/repertoire.pgn` that already
  carries a short why-comment — the same idea, said fully.

Key it so both Line Drill and the new Learn mode can look entries up by the
same identifiers `repertoire.pgn` already uses (system name; line name + SAN
for the per-move text) — no change to `repertoire.pgn` itself.

Same register as the existing why-comments (010's authoring pass): concrete,
plain, no filler. Machine-validated the way 010's seed PGNs were, if a
similar check is cheap to add (e.g. every commented move in
`repertoire.pgn` has a matching `learn.json` entry).

## Resolution (2026-08-04)

`data/learn.json` written: three system briefs (`plans`/`pawnBreaks`/
`keySquares`, text only) plus a longer take on all 105 commented moves
across the 22 repertoire lines, one full sentence or two per move,
expanding the exact idea the short why-comment already carries rather than
adding new claims.

Keying: `systems.<System>` for the briefs; `lines.<line name>.<move key>`
for per-move text, `<line name>` matching `pgn.ts`'s already-stripped
`Event` tag and `<move key>` the move-number-qualified SAN exactly as
`repertoire.pgn` prints it (`"2.Nf3"`, `"3...Bf5"`) — plain SAN alone
collides once (the vs-Petrov line's knight visits f3 twice, ply 2 and ply
4), so the number disambiguates and stays greppable against the PGN
itself. `repertoire.pgn` untouched.

`scripts/validate-learn.mjs` (Node + chess.js, already a project
dependency — no python-chess needed) reparses `repertoire.pgn` the same
way `pgn.ts` does and checks: all three system briefs non-empty, every
commented move has a matching entry, and no orphan lines/keys in
`learn.json` that don't exist in the PGN. Passes clean.
