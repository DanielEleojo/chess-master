---
title: Off-the-shelf data for a beginner repertoire and classic traps
type: research
status: closed
assignee: danielbaba029
blocked-by: []
---

## Question

Ticket 003 decided the blend fills gaps from a recommended sub-1200 repertoire and seeds junk-punishing drills from a curated classic-traps list. Find off-the-shelf (never hand-roll) sources for both:

- Ready-made beginner repertoire line sets in machine-readable form (PGN/TSV) — lichess studies with export, openly licensed repertoire datasets, or lines extractable from the lichess CC0 openings TSV already chosen in ticket 002.
- A classic beginner traps dataset *with refutations* (Scholar's mate, wayward queen, Fried Liver attempts, common gambit junk) — licensing, format, how many traps, whether refutation lines are included.
- For each candidate: license, format, effort to ingest.

## Resolution

No openly licensed off-the-shelf dataset exists for either half — verified against database.lichess.org (no studies dump), GitHub (only repertoire *generators* and unlicensed trap apps), and the puzzle theme list (no "trap" theme). The lichess study export API delivers clean annotated PGN for public studies with no auth (verified `OyqewZTH`, which covers Scholar's Mate/Wayward Queen/Fried Liver counters with refutations), but study content is author-copyrighted — fine locally, not redistributable. The chess-openings TSV is confirmed a naming dictionary (lines truncate at the naming point, no refutations). Laziest viable path: hand-write one ~12–20-trap `traps.pgn` with refutations (moves are uncopyrightable facts, ~an afternoon), auto-named via the CC0 openings TSV, cross-linked to CC0 puzzle-DB drills via `OpeningTags` + `attackingF2F7`; repertoire likewise a tiny hand-written PGN (2 white + 2 black systems), optionally seeded from an exported study kept local. Full details: [../../research/003-repertoire-traps-data.md](../../research/003-repertoire-traps-data.md)
