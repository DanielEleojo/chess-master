---
title: Build the v1 shell — scaffold, board, opening drill on real seeds
type: task
status: closed
assignee: baba
blocked-by: [004, 005, 010]
---

## Question

Stand up the app decided in 004 and make it trainable: port the drill flow decided in 005 onto the real seed data from 010. Done when `npm run dev` opens a page where Daniel can run a blended line drill and trap puzzle cards against `data/repertoire.pgn` / `data/traps.pgn`.

Checklist:

- **Daniel first (HITL step)**: upgrade Node to 22+ LTS via pacman — npm 12 requires it (004).
- Scaffold Vite `react-ts`; add chessground, chess.js, stockfish from npm (002's picks).
- `vite.config.ts` middleware: `GET/PUT /api/data/<name>` ↔ `data/*.json` (004).
- One chessground wrapper component (ref/effect; DIY promotion picker per 002).
- Port the drill engine from `prototypes/drill-flow.html` as plain modules: blended line drill (endless streak pacing, explain-why-on-miss, miss requeue) + fast puzzle cards from traps.pgn (005).
- Drill history persists to `data/` via the middleware.

Not in scope: sync loop (006 designs it first), engine sparring, analysis, lichess puzzle filtering (tactics mode, still fog). If 012 (watch-first intro pass) is resolved by build time, honor it; otherwise default to no intro pass — misses teach, per 005's philosophy.

## Resolution

Built and verified 2026-08-03 — `npm run dev` at the repo root is the app (<http://localhost:5173>).

- **Node (the HITL step dissolved)**: npm 12's "requires Node ≥ 22" is a warning, not a wall — everything installs and runs on the stock Node 20.20.2, so the build never blocked on the pacman upgrade. Vite is pinned to `^7` because Vite 8 *does* require Node 22+; when Daniel upgrades (`sudo pacman -S nodejs-lts-jod` or whatever CachyOS calls Node 22 LTS), the pin and the npm warning both go away.
- **Scaffold**: hand-written Vite + React + TS at the repo root — `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/`. Deps per 002: chessground 9, chess.js 1.4, react 19, stockfish 18 (installed as the ticket asked, unwired until sparring).
- **Data middleware**: `GET/PUT /api/data/<name>` ↔ `data/<name>.json` as a ~40-line plugin in `vite.config.ts` (name sanitized, body must parse as JSON). Seed PGNs need no middleware — Vite serves the repo root, so the app just fetches `/data/*.pgn`.
- **Engine port** (prototype's logic as plain modules, DOM rewritten — exactly per 004): `src/lib/pgn.ts` (multi-game PGN → lines with fen-keyed why-comments), `src/lib/drill.ts` (`makeDrill`, verbatim), `src/lib/history.ts` (stats + weakest-first ordering), `src/lib/fx.ts`, `src/components/Board.tsx` (the one chessground wrapper).
- **Line drill** (`src/modes/LineDrill.tsx`) — the 005 blend: endless streak over all 22 lines; queue is weakest-first from real history (most-missed, then least-seen — replacing the prototype's fake order); miss №1 explains why (PGN comment, else piece hint) and retries; miss №2 shows the green arrow, play it to continue; missed lines requeue 2 slots later and wear a "missed" badge; end-whenever summary. Cold start on new lines (012 stayed open → default held).
- **Trap cards** (`src/modes/TrapCards.tsx`) — A's fast-card shell refilled per 005: one card per *commented punisher move* in `traps.pgn` (the comment is the card's why; pure-mate traps quiz the final blow) → 22 cards, 10 dealt weakest-first, miss = arrow + the why + play it to continue.
- **Persistence**: per-line / per-card seen-missed counts plus a session log in `data/drill-history.json`, saved via the middleware after every completed line and deal; home screen shows lifetime stats. Shipped file is empty — the recorded runs were mine from verification.
- **Deviation**: no DIY promotion picker — no seed line or trap can reach promotion, so the drill auto-queens with a `ponytail:` note in `drill.ts`; build the picker when puzzle/analysis data can promote.
- **Verified**: `?selftest=1` ports the prototype's checks against the real fetched seeds plus a middleware round-trip — all green (22 lines, 15 traps, 22-card deck, 20 carrying whys). Both modes driven end-to-end headlessly via dev hooks (`window.cmMove`/`cmExpected`): full miss ladder, streak/accuracy math, requeue + revenge badge, history byte-checked on disk. Verification caught one real bug — a finished deck's last card kept accepting moves and re-recording history 4× (`finish()` now nulls the drill). `tsc` clean, zero console errors.

Graduated from fog on resolution: 013 (tactics puzzle pipeline), 014 (engine sparring prototype).
