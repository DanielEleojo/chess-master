---
title: Pick the v1 stack and storage
type: grilling
status: open
assignee:
blocked-by: [001, 002]
---

## Question

What does Chess Master v1 run on?

- Server: Node vs Bun vs Python — whichever makes the chess.com polling + static serving laziest given research findings.
- Frontend: Vite + which view layer (or none), given the board library chosen in 002.
- Storage: SQLite vs plain JSON files for games, repertoire, drill history, coach signals.
- One-command start: what does `npm run dev` (or equivalent) actually launch?

Decide lazily from ticket 001 and 002 findings — smallest stack that carries all four modes.
