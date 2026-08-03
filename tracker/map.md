---
labels: [wayfinder:map]
title: Chess Master — way to a working training app
---

## Destination

A running local web app Daniel starts with one command and actually trains with: opening drilling first, then tactics, engine sparring, and own-game analysis — fed by near-instant chess.com game sync and an adaptive coach that steers practice toward his weaknesses.

## Notes

- This effort carries execution into the map (working v1, not a spec) — wayfinder's plan-don't-do default is overridden here.
- User: chess.com player, under ~1200 (confirm exact username when working the sync ticket).
- Ponytail mode is active: laziest working solution, off-the-shelf first (chess.js, Stockfish WASM, existing puzzle/opening data — never hand-roll chess logic).
- Skills per session: /grilling + /domain-modeling for decisions, /prototype for UX questions, /research subagents for AFK facts.
- Tracker: local markdown. Tickets are files in `tracker/tickets/`, frontmatter holds `type`, `status`, `assignee`, `blocked-by`. Claim = set `assignee`. Frontier = open, unassigned, all `blocked-by` tickets closed.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md) — gist -->

- [What can the chess.com API actually give us?](tickets/001-chesscom-api-capabilities.md) — monthly archive endpoint has ~5s cache + ETag 304s, so near-instant sync via adaptive serial conditional polling is officially sanctioned; PGN carries clocks/ECO; no live-game endpoint exists.
- [Off-the-shelf chess building blocks for a local web app](tickets/002-chess-building-blocks.md) — chessground + chess.js + stockfish.js lite (Skill Level, not UCI_Elo, for weak play) + lichess CC0 openings TSV & puzzle DB; hand-roll nothing.
- [Which openings should the trainer drill first?](tickets/003-which-openings-first.md) — blend: one-time bulk archive import derives what he plays, gaps filled from a recommended sub-1200 repertoire; both colors day one; lines seed at ~5 moves, extending miss-driven only (needs analysis mode's left-book signal); junk-punishing drills seeded from curated traps then mined from real opponents.

## Not yet specified

- Tactics puzzle mode — source, difficulty targeting for <1200, spaced repetition. Sharpens after building blocks + stack are decided.
- Play-vs-engine mode — strength calibration for sub-1200, time controls. After building blocks + stack.
- Own-game analysis — blunder detection depth, how findings render; must also emit "left book at move N" signals, which drive the opening trainer's miss-driven depth extension. After API research, stack, and sync design.
- Adaptive coach — what signals feed it, how it recommends practice. Needs several modes to exist first.
- Progress/data model tying modes together. After stack decision.
- The v1 build itself — sliced into tasks once the stack and the opening-trainer prototype resolve.

## Out of scope

- Playing against other humans or hosting anything online; mobile app; chess.com *write* access (the API is read-only — the app trains Daniel, it doesn't play for him).
