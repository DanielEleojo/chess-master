---
title: Engine sparring — a beatable Stockfish for a sub-1200
type: prototype
status: open
assignee: claude
blocked-by: [011]
---

## Question

Wire the installed-but-unwired `stockfish` dep into a sparring mode and calibrate it until it feels beatable-but-honest for rapid-335 Daniel: stockfish.js lite in a Web Worker, weakened per 002 — Skill Level 0–5 plus node caps plus MultiPV softmax pick (not `UCI_Elo`: real floor 1320 and it plays weirdly there). Prototype-first like 005: a playable rough take, Daniel spars, his reaction picks the presets.

Open while prototyping:

- strength presets — how many rungs, named how, and what actually varies per rung;
- time controls, or none (casual move-when-ready);
- where a spar starts — fresh game, or from a repertoire line he's drilling (ties sparring back to the opening trainer).

## Asset

`src/modes/Spar.tsx` — the rough take lives **in the app**, not in a standalone HTML like 005's: the shell exists now, so reusing `Board`, `engine.ts` and the styles was far less code than a second CDN page. `npm run dev` → home → **Sparring** (the card is badged `rough`). Nothing persists; no history, no coach, no data-model change.

- **Stale premise corrected**: `stockfish` was *not* unwired — 016/017 wired `src/lib/engine.ts` for analysis. This ticket added one method, `playFen(fen, skill, nodes)`.
- **Strength = (Skill Level, nodes) only.** 002's MultiPV softmax was skipped: Stockfish's own Skill Level already randomises among its candidate moves, so the softmax buys nothing unless the *floor* is too high. Five rungs as a starting guess — Careless (0/1n), Rookie (0/40n), Beginner (0/400n), Improver (3/4k), Club player (6/40k) — switchable **mid-game**, so a whole ladder can be felt in one sitting.
- **No clock**: elapsed counts up per side, nothing flags. The cheapest way to make the time-control question concrete without building one.
- **Start from**: fresh game (White / Black / Random) *or* any of the 22 repertoire lines — the line is played out and the spar continues from where the book ends.
- **Measured while verifying**: even `nodes 1` defends scholar's mate (1.e4 e5 2.Bc4 Nc6 3.Qh5 g6 4.Qf3 Qf6) — Stockfish's move ordering alone plays sensibly, so the bottom rung is not a fish and the floor may still be above Daniel. The setup screen says so; if it beats him every time, the fix is random-among-top-moves, not a smaller node cap.
- **Verified** headlessly via `window.cmMove` / new `window.cmSpar()`: engine replies at every rung, illegal moves ignored, line-start plays the book out and orients the board, resign freezes the board, `tsc` clean, zero console errors. (Checkmate/stalemate detection is three chess.js calls, not machine-driven.)

Awaiting Daniel's reaction: which rungs survive and what they're called, clock or no clock, and whether spar-from-a-line is worth keeping. Frankenstein answers welcome.
