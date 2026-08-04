---
title: Extend a left line — auto-append plies or propose to Daniel?
type: grilling
status: open
assignee:
blocked-by: []
---

## Question

003 wants repertoire lines to deepen where real games leave book, and the signal chain now exists end-to-end: 016 records the departure (line, ply, who left, expected move) and 018's coach calls a line left early ≥2 times a Weakness and points Daniel back at it. But re-drilling the same 5-ply seed doesn't fix "the game outlived my book" — the line itself must grow.

Decide the extension mechanism:

- When the coach flags a left line, does the app **auto-append** plies (from what? engine best? the moves opponents actually played in those games?) or **propose** an extension Daniel accepts/edits?
- How many plies per extension, and does the grace-first-attempt rule (012) apply to the new tail?
- Where does the extension live — edited into `data/repertoire.pgn` (one source of truth, survives re-seed?) or layered separately?

Evidence to grill against: the departures recorded in `data/analysis.json` (which lines, which plies, opponent moves at the break point).
