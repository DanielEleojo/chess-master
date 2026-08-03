---
title: Author the seed data — repertoire.pgn and traps.pgn
type: task
status: open
assignee:
blocked-by: []
---

## Question

Hand-write the two seed files that 008 (no off-the-shelf dataset exists) and 009 (which systems) decided. AFK — moves are uncopyrightable facts; the lichess study `OyqewZTH` may be consulted locally but not copied.

- `data/repertoire.pgn` — Italian (White), Caro-Kann (vs 1.e4), Slav (vs 1.d4). Lines seed at ~5 moves per ticket 003: main line plus the replies Daniel actually faces in `data/archives/` (e.g. Caro-Kann Exchange, 2.Nf3, 2.Nc3 all appear).
- `data/traps.pgn` — ~12–20 classic traps *with refutations* (Scholar's Mate, Wayward Queen, Fried Liver attempts, common gambit junk), per 008.

Opening names come at ingest via the CC0 openings TSV; cross-link to CC0 puzzle drills via `OpeningTags`/`attackingF2F7` (008). Answer records file locations and line/trap counts.
