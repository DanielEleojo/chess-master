---
title: Author the seed data — repertoire.pgn and traps.pgn
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Hand-write the two seed files that 008 (no off-the-shelf dataset exists) and 009 (which systems) decided. AFK — moves are uncopyrightable facts; the lichess study `OyqewZTH` may be consulted locally but not copied.

- `data/repertoire.pgn` — Italian (White), Caro-Kann (vs 1.e4), Slav (vs 1.d4). Lines seed at ~5 moves per ticket 003: main line plus the replies Daniel actually faces in `data/archives/` (e.g. Caro-Kann Exchange, 2.Nf3, 2.Nc3 all appear).
- `data/traps.pgn` — ~12–20 classic traps *with refutations* (Scholar's Mate, Wayward Queen, Fried Liver attempts, common gambit junk), per 008.

Opening names come at ingest via the CC0 openings TSV; cross-link to CC0 puzzle drills via `OpeningTags`/`attackingF2F7` (008). Answer records file locations and line/trap counts.

## Resolution (2026-08-03)

Both files written and machine-validated:

- **`data/repertoire.pgn` — 22 lines**, each ~5 moves ending on Daniel's move, tagged `[System]` + `[TrainAs]` (names come at ingest via the TSV, per the plan). Branches chosen from what the archive shows he faces:
  - *Italian (White), 8 lines*: Giuoco Piano main, Two Knights (4.Ng5), vs Philidor setup (2...d6, 12 games), vs Petrov (7), vs Scandinavian (24), vs Alekhine (13), French Exchange (7), Open Sicilian (6).
  - *Caro-Kann (Black), 8 lines*: Exchange, Advance, Classical (4...Bf5 — deliberately dodges the smothered-mate line), vs 2.Nf3, vs 2.Nc3, vs 2.Bc4 (23 games!), vs 2.Qh5 (14!), vs 2.d3 (8).
  - *Slav (Black), 6 lines*: main (2.c4), vs London, vs 2.Nf3, vs 2.e3, vs 2.Nc3, plus the 2.e4→Caro transposition signpost.
- **`data/traps.pgn` — 15 traps** with refutations, tagged `[Punisher]`; mainline is always the line Daniel's side wants, opponent mistakes and correct declines noted in comments. Five directly target the junk he actually faces as Black (2.Bc4 + 2.Qh5 = 37 archive games): Wayward Queen ×2, Hillbilly, plus generic Scholar's/Fool's. As White: Fried Liver, Légal's Mate, Petrov copycat, Stafford refutation, Blackburne Shilling refutation, Damiano, early-queen punish, Latvian, Elephant, and the Caro smothered mate (avoid-trap for his own repertoire).
- **`scripts/validate-seeds.py`** replays every game with python-chess: every move legal, required tags present, decisive results really end in mate. Both files pass; a deliberately corrupted copy fails (illegal move + fake mate both caught). Run via any python with `python-chess` installed. Lichess study `OyqewZTH` was not copied from; lines are standard theory written from scratch.
