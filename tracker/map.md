---
labels: [wayfinder:map]
title: Chess Master — way to a working training app
---

## Destination

A running local web app Daniel starts with one command and actually trains with: opening drilling first, then tactics, engine sparring, and own-game analysis — fed by near-instant chess.com game sync and an adaptive coach that steers practice toward his weaknesses.

## Notes

- This effort carries execution into the map (working v1, not a spec) — wayfinder's plan-don't-do default is overridden here.
- User: chess.com username `babadaniel` (confirmed live: rapid 335, blitz 125, bullet 132 — sub-1200 everywhere).
- Ponytail mode is active: laziest working solution, off-the-shelf first (chess.js, Stockfish WASM, existing puzzle/opening data — never hand-roll chess logic).
- Skills per session: /grilling + /domain-modeling for decisions, /prototype for UX questions, /research subagents for AFK facts.
- Tracker: local markdown. Tickets are files in `tracker/tickets/`, frontmatter holds `type`, `status`, `assignee`, `blocked-by`. Claim = set `assignee`. Frontier = open, unassigned, all `blocked-by` tickets closed.
- Domain glossary: `CONTEXT.md` (coaching terms are binding); decisions in `docs/adr/`. Local LLM: Ollama at `localhost:11434`, `qwen2.5:7b-instruct` — the coach voice; it phrases, never decides (ADR 0001).

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md) — gist -->

- [What can the chess.com API actually give us?](tickets/001-chesscom-api-capabilities.md) — monthly archive endpoint has ~5s cache + ETag 304s, so near-instant sync via adaptive serial conditional polling is officially sanctioned; PGN carries clocks/ECO; no live-game endpoint exists.
- [Off-the-shelf chess building blocks for a local web app](tickets/002-chess-building-blocks.md) — chessground + chess.js + stockfish.js lite (Skill Level, not UCI_Elo, for weak play) + lichess CC0 openings TSV & puzzle DB; hand-roll nothing.
- [Which openings should the trainer drill first?](tickets/003-which-openings-first.md) — blend: one-time bulk archive import derives what he plays, gaps filled from a recommended sub-1200 repertoire; both colors day one; lines seed at ~5 moves, extending miss-driven only (needs analysis mode's left-book signal); junk-punishing drills seeded from curated traps then mined from real opponents.
- [Off-the-shelf data for a beginner repertoire and classic traps](tickets/008-repertoire-traps-data.md) — no openly licensed ready-made dataset exists for either; lichess study export gives auth-free PGN but author-copyrighted (local-use only), so hand-write a small traps.pgn (~12–20 traps + refutations) and a tiny repertoire PGN, auto-named via the CC0 openings TSV and cross-linked to CC0 puzzles via OpeningTags/attackingF2F7.
- [Bulk-import Daniel's chess.com archives](tickets/007-bulk-archive-import.md) — username is `babadaniel`; all 499 games (Feb 2023–Aug 2026, mostly rapid, bulk from Jul 2026) live in `data/archives/YYYY-MM.json` with full PGN/clocks/ECO per game; re-runnable via `scripts/import-archives.sh`.
- [Pick the gap-filling recommended repertoire](tickets/009-gap-filling-repertoire.md) — Italian as the White system; Caro-Kann kept vs 1.e4; Slav vs 1.d4 (formalizing his existing 1...c6/...d5 instinct); a line from his games is "worth keeping" iff it belongs to one of those three systems — all other dabbles retire from the drill set.
- [Author the seed data — repertoire.pgn and traps.pgn](tickets/010-author-seed-pgns.md) — `data/repertoire.pgn` (22 lines: 8 Italian / 8 Caro-Kann / 6 Slav, branches picked from what the archive shows he faces) and `data/traps.pgn` (15 traps with refutations, five aimed at the 2.Bc4/2.Qh5 junk he meets constantly); both machine-validated by `scripts/validate-seeds.py`.
- [Opening-trainer drill flow — what does a practice session feel like?](tickets/005-opening-drill-prototype.md) — two surfaces sharing one drill engine: a blended line drill (endless streak pacing + explain-why-on-miss, misses requeue, no time-based SRS) and fast puzzle cards sourced from positions he'd meet in his real games (traps/junk day one, own-game misses later); bare recite-the-line cards rejected. Prototype: `prototypes/drill-flow.html`.
- [Pick the v1 stack and storage](tickets/004-v1-stack-and-storage.md) — Vite + React + TypeScript on Node 22+ (pacman upgrade pending, npm 12 demands it); no backend beyond a ~20-line Vite middleware saving `data/*.json`; the browser polls chess.com directly (CORS `*` + browser-cache ETag revalidation, verified live); JSON files for all storage, SQLite only if queries someday hurt; `npm run dev` is the app.
- [Build the v1 shell — scaffold, board, opening drill on real seeds](tickets/011-build-v1-shell-drill-mode.md) — `npm run dev` now opens the real app: Vite+React shell at the repo root, `/api/data` middleware, and both 005 surfaces drilling the seed PGNs — blended line drill (weakest-first queue, explain-on-miss, requeue) and 22 trap cards — with history persisting to `data/drill-history.json`; runs on stock Node 20 (Vite pinned to 7, pacman upgrade now optional), selftest all green.

- [Do never-before-drilled lines get a watch-first intro pass?](tickets/012-watch-first-intro-pass.md) — no: cold-start stands (misses teach), softened only by a stats-side grace — a line's first-ever miss isn't recorded in drill history (teaching/requeue unchanged), while a first-attempt hit counts.
- [How does "instant" game sync work?](tickets/006-instant-game-sync-design.md) — tab visibility drives cadence (10s visible / 60s hidden / 5s burst ~3 min after an arrival), no presence lookups or unofficial endpoints; arrival = persist + non-blocking toast + unseen flag for future analysis, never interrupting a drill; honest promise is ~10–15s while visible (5s server cache is the floor) with only a tiny "last synced" line as UI.
- [Build the live sync loop](tickets/015-build-live-sync.md) — 006's design now runs in the shell (`src/lib/sync.ts` + `archives/` prefix on the 004 middleware): month-file uuid-diff, corner toasts, unseen uuids in `data/sync-state.json`, "last synced" line; verified live when a real bullet game arrived mid-session and toasted within one poll.
- [Own-game analysis — blunders, rendering, left-book signal](tickets/016-own-game-analysis.md) — analysis mode shipped: stockfish walks any game at 300ms/position, flags his swings (thresholds as knobs), records the 013-ready blunder shape and the 003 left-book signal in `data/analysis.json`, clears unseen flags; Daniel's reactions hardened depth, pacing, and per-move why-comments, and his "explain why my move breaks" rejection of bare PVs spawned the coach effort (017/018, CONTEXT.md, ADR 0001).
- [Explanation engine — fact layer + coach voice](tickets/017-explanation-engine.md) — two layers shipped per ADR 0001: `facts.ts` computes deterministic truths (hangs, material along the now-persisted refutation PV, mate, forks, checks, castling, positional fallback; selftest-covered) and `coach.ts` has Ollama phrase them (facts-only when down); auto per flagged move in analysis, on-demand "why not my move?" in drills where a shrugging engine yields the discipline answer instead.

## Not yet specified

- Progress/data model tying modes together — `data/drill-history.json` (011), `data/sync-state.json` (015), `data/analysis.json` (016) now exist; how puzzle (013) and sparring (014) results join them as coach signals (018's ladder) emerges as those modes get built.
- Miss-driven line extension — 003 wanted lines to deepen where real games leave book; the signal now exists (016's book departures). How extension actually works (auto-append plies? propose to Daniel?) sharpens once 018 shows which lines he keeps leaving.

## Out of scope

- Playing against other humans or hosting anything online; mobile app; chess.com *write* access (the API is read-only — the app trains Daniel, it doesn't play for him).
