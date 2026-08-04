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

- **Stale premise corrected**: `stockfish` was *not* unwired — 016/017 wired `src/lib/engine.ts` for analysis. This ticket added one method, `playFen(fen, weak)`.
- **Strength = (nodes, multipv, temp)** — settled in round 2 below. Five rungs, switchable **mid-game** so a whole ladder can be felt in one sitting: Careless (500n, top 8, ±900cp), Rookie (500n, top 6, ±350cp), Beginner (800n, top 4, ±140cp), Improver (4000n, top 3, ±55cp), Club player (40000n, always best).
- **No clock**: elapsed counts up per side, nothing flags. The cheapest way to make the time-control question concrete without building one.
- **Start from**: fresh game (White / Black / Random) *or* any of the 22 repertoire lines — the line is played out and the spar continues from where the book ends.
- **Verified** headlessly via `window.cmMove` / new `window.cmSpar()`: engine replies at every rung, illegal moves ignored, line-start plays the book out and orients the board, resign freezes the board, `tsc` clean, zero console errors. (Checkmate/stalemate detection is three chess.js calls, not machine-driven.)

## Round 1 reaction (Daniel, 2026-08-04): the floor still beats him

Starving the search does not make Stockfish weak — measured, `nodes 1` still defends scholar's mate (1.e4 e5 2.Bc4 Nc6 3.Qh5 g6 4.Qf3 Qf6), because move ordering alone plays sensibly. So **002's MultiPV softmax is now the dial**, and it replaces the node cap as the weakening mechanism: search wide enough to *have* candidates, then pick sloppily among them.

- `engine.ts` gained `softmaxPick(cands, temp)` — weights each MultiPV candidate by `exp((cp − best) / temp)`, so `temp` reads directly as "the centipawn loss a move can carry and still be played ~37% as often as the best one". `temp: 0` = always the top move.
- **Skill Level deleted.** It only rewrites Stockfish's `bestmove`, which `playFen` now discards in favour of its own pick — measured inert (Club player at skill 6 played the objectively top reply every time). One knob fewer, and the labels stop lying.
- Effect, measured live: the floor's reply to 1.e4 now varies run to run (a5 / e6 / g6 / d5 / Nf6 across eight games) where the old ladder was near-deterministic; the top rung stays deterministic.
- **Selftest** (`?selftest=1`) now covers the pure softmax: temp 0 never strays, the floor plays a −900cp move ~12% of the time, and Improver hangs it less than half as often. All green.

Awaiting Daniel's round-2 reaction: is the floor beatable now (and is it *too* silly), how many rungs survive and what they're called, clock or no clock, and whether spar-from-a-line is worth keeping.
