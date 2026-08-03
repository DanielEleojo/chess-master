---
title: Pick the v1 stack and storage
type: grilling
status: closed
assignee: daniel
blocked-by: [001, 002]
---

## Question

What does Chess Master v1 run on?

- Server: Node vs Bun vs Python — whichever makes the chess.com polling + static serving laziest given research findings.
- Frontend: Vite + which view layer (or none), given the board library chosen in 002.
- Storage: SQLite vs plain JSON files for games, repertoire, drill history, coach signals.
- One-command start: what does `npm run dev` (or equivalent) actually launch?

Decide lazily from ticket 001 and 002 findings — smallest stack that carries all four modes.

## Resolution

Grilled 2026-08-03; all four axes confirmed by Daniel.

- **Runtime**: Node 22+ LTS. Daniel upgrades via pacman before first `npm install` — his npm v12 officially requires Node ≥ 22 and warns on the installed v20.20.2. Python 3.14 stays for offline data scripts (established pattern: `scripts/validate-seeds.py`).
- **Frontend**: Vite + **React + TypeScript** (`react-ts` template — React chosen over the vanilla recommendation; Daniel wants the component model as coach/stats UI grows). Chessground gets one small ref/effect wrapper component; the drill-engine logic in `prototypes/drill-flow.html` ports as plain modules, only its DOM code is rewritten.
- **Server**: none beyond the Vite dev server. A ~20-line middleware plugin in `vite.config.ts` exposes `GET/PUT /api/data/<name>` ↔ `data/*.json`. Stockfish's worker files are served same-origin by Vite (avoids the COOP/COEP hassle flagged in 002). `npm run dev` is the app, permanently — no build/deploy step for a personal tool.
- **Sync home**: the **browser polls `api.chess.com` directly**. Verified live 2026-08-03: `Access-Control-Allow-Origin: *`, preflight allows GET, and `Cache-Control: max-age=5` + ETag mean the browser's own HTTP cache performs conditional revalidation — the page just runs a plain `fetch` loop, no ETag bookkeeping, no server poller. Cadence/backoff/arrival-triggers remain ticket 006's question.
- **Storage**: **JSON files in `data/`** — archives stay as imported (007), seeds stay PGN (010), drill history and coach signals become small JSON files saved via the middleware, and puzzles get pre-filtered offline (Python) from the 6M-row lichess CSV into a `puzzles.json` when tactics mode arrives. SQLite deferred until queries actually hurt; post-upgrade `node:sqlite` is built-in if that day comes.

Considered and dropped: a server-side poller (buys only app-closed sync, moot since chess.com archives are always re-fetchable) and the polite custom User-Agent from 001 (browsers can't set it; one serial request per 5–15s from Daniel's own browser is indistinguishable from browsing chess.com).
