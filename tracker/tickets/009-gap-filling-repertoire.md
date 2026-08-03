---
title: Pick the gap-filling recommended repertoire
type: grilling
status: closed
assignee: babadaniel
blocked-by: [007, 008]
---

## Question

Ticket 003's blend keeps the sound lines Daniel already plays and fills the rest from a recommended sub-1200 repertoire. Once the bulk import (007) shows what the gaps actually are and the data research (008) shows what line sets exist off the shelf, decide with Daniel:

- Which White system fills White gaps (e.g. Italian vs London)?
- Which defenses vs 1.e4 and 1.d4 fill Black gaps?
- What counts as a "sound line worth keeping" from his own games — engine eval threshold, or just book membership?

## Resolution (2026-08-03)

Decided with Daniel, grounded in the 499-game archive:

- **White system: Italian Game** (1.e4 e5 2.Nf3 Nc6 3.Bc4). The archive shows 1.e4 in 204/249 White games but no consistent system — Vienna dabbles (~23 games), shapeless King's Pawn, passive 2.d3 Leonardis. Daniel chose the mainstream Italian over formalizing the Vienna habit; it also has the best synergy with the 008 traps/puzzle data (Fried Liver, `attackingF2F7`).
- **Vs 1.e4: Caro-Kann** — kept, not filled. 113 games; his established defense per ticket 003's "keep sound lines he plays".
- **Vs 1.d4: Slav Defense** — formalizes what he already does: 1...c6 in 36 of 47 games vs 1.d4, followed by ...d5 in 31 of 33 recorded second moves. Same c6–d5 structure as the Caro-Kann, and 1.d4 c6 2.e4 transposes straight into it.
- **"Sound line worth keeping" = membership in the three chosen systems** (Italian / Caro-Kann / Slav). His games pick which sub-variations seed first; everything else (Vienna, Leonardis, etc.) retires from the drill set. Rejected: book membership (the CC0 openings TSV names junk lines too — Englund, Leonardis) and engine-eval thresholds (wires Stockfish into the import path before analysis mode exists).

Archive facts backing this: as White — 1.e4 204, 1.d4 32, other 13. As Black vs 1.e4 — 1...c6 113, 1...e5 15, 1...c5 12. As Black vs 1.d4 — 1...c6 36, 1...d5 5, other 6.
