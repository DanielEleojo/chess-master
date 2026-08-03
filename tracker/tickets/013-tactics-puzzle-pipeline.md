---
title: Tactics mode — filter lichess puzzles into his-repertoire decks
type: task
status: open
assignee:
blocked-by: [011]
---

## Question

Build the tactics surface: an offline Python script (established pattern: `scripts/`) filters the CC0 `lichess_db_puzzle.csv.zst` (6.06M rows, 002) into a `data/puzzles.json` the card surface from 011 can deal — Rating roughly 600–1300, beginner themes, `OpeningTags` matching his three systems (Italian / Caro-Kann / Slav) plus the `attackingF2F7`-flavored junk themes (008's cross-link).

Decide while building, Daniel reacting to a working deal (005-style):

- difficulty band — fixed, or tracking his results;
- deck size and cards per session;
- how multi-move puzzles fit the one-move card shell from 011 — extend the card into a mini-drill (the trap-line mechanics already exist), or start one-move-only.
