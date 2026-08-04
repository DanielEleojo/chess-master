---
title: Engine sparring — a beatable Stockfish for a sub-1200
type: prototype
status: closed
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

## Round 2 reaction (Daniel, 2026-08-04): "I still want it to be hard"

Verbatim: *"i still want it to be hard, the goal is to challenge my self not get comfortable, it should feel almost like im not making any progress."*

Read against his round-1 ask ("the floor still beats me, add the randomness"), these only look contradictory. He wants a rung to be **winnable** but not **farmable** — so the randomness stays and the ladder stops sitting still:

- **Beat a rung and it retires.** A win promotes him one rung, permanently. Losing never demotes; nothing resets. The engine therefore lives just above him forever, which is exactly what "almost like I'm not making progress" feels like from the inside — real progress, absorbed by a stronger opponent instead of paid out as easier wins.
- **The picker only goes up.** Retired rungs render `✓ beaten — retired` and are disabled in both the setup list and the mid-game selector. Jumping ahead is still allowed — the only thing removed is the way back down.
- **Top rung is a wall on purpose**: at Club player a win prints *"Top rung — nothing above this one."* If he hits that wall, that's the signal to add rungs above it, not a bug.
- **ponytail**: the rung is `localStorage['cm.rung']`, not `data/*.json`. It's one number of UI state, and whether spar results belong in the training record is still fog on the map — this doesn't pre-empt that decision.

Verified live: promotion advances the badge and both pickers mid-game, disables what's beaten, survives a reload, and stops cleanly at the top. `tsc` clean, selftest green, no console errors. Honest caveat — the ratchet was driven through a `window.cmPromote()` dev hook (same idiom as `cmMove`/`cmSpar`) rather than by actually mating the engine; scholar's mate lost 10/10 attempts against the floor, which is its own data point about how strong "Careless" still is. The `won → promote()` trigger is a single call site in `finished()`.

## Round 3 reaction (Daniel, 2026-08-04): "2 wins is enough"

The climb rate, answered before he'd played it: **`WINS_TO_CLIMB = 2`** (exported knob). One win is luck, two is a level. A first win banks and says so (`1/2 against Careless — win once more and it retires`); the second retires the rung and resets the count. Manual jumps reset it too — banked wins are per rung, not carried.

- The count is `localStorage['cm.wins']` alongside the rung, shown as a gold `1/2` badge on the current rung in setup and as `n/2 wins here` in the mid-game panel.
- **Default rung dropped to the floor (Careless).** Screenshotting the round-3 build caught it lying: everything below the current rung renders `✓ beaten — retired`, so the old default of Rookie claimed a win over Careless he had never played. Starting at the floor is the only honest default when the UI reads "below = beaten"; jumping ahead is one click.

Verified live from a cleared state: 0/2 → 1/2 banks without moving the rung, 2/2 retires Careless and lands on Rookie at 0/2, a mid-game jump to Improver discards a banked win, all of it surviving reload. `tsc` clean, no console errors.

## Round 5 (Daniel, 2026-08-04): "let's finish up, make this look good"

Closing. Sparring stops being a prototype and becomes a mode like the others — the
`rough` badge is gone, the ticket number is out of the copy, and the rung list renders
as a ladder you climb instead of a stack of dev knobs. The home card now shows the
rung he's on (`Sparring · Careless`) rather than a caveat.

The five calibration questions the prototype opened are **answered by playing, not by
another round**: the rungs, `WINS_TO_CLIMB`, and the no-clock choice are all exported
knobs one edit from changing. If Careless still can't be beaten, that's a `temp`
bump, not a new ticket.

Shipped alongside a whole-app design pass (see below) — sparring's setup screen was
the worst-looking surface in the app and fixing it in isolation would have made the
rest look unfinished.
