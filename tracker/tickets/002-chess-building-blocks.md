---
title: Off-the-shelf chess building blocks for a local web app
type: research
status: closed
assignee: daniel
blocked-by: []
---

## Question

What are the best current off-the-shelf pieces for a local-web-app chess trainer, so we hand-roll nothing?

Specifically:
- Board UI: chessground vs chessboard.js vs alternatives — maintenance, ease, drag/drop + arrows/highlights support.
- Move logic/PGN: chess.js current state (v1 API), PGN parsing fidelity for chess.com exports.
- Engine: Stockfish WASM builds usable from a browser or Node; how to limit strength believably for sub-1200 sparring (UCI_LimitStrength/Elo floor — what's the real minimum Elo, and known tricks for weaker play).
- Opening data: lichess chess-openings TSV (ECO ↔ name ↔ moves) or similar, for recognizing and drilling openings.
- Puzzle source that doesn't require a lichess account: the lichess puzzle database CSV — license, format, size, how to filter by rating/theme for an under-1200 player.

Unblocks: stack decision (004).

## Resolution

Full findings: [research/002-building-blocks.md](../../research/002-building-blocks.md). The picks:

- **Board UI**: `@lichess-org/chessground` (framework-free, actively maintained, best drag/arrows; needs a DIY promotion picker — `cm-chessboard` is the MIT fallback with one built in).
- **Move logic/PGN**: `chess.js` v1.4 — its PGN parser handles chess.com exports; `%clk`/accuracy comments survive as raw comments, extractable via regex on `getComments()`.
- **Engine**: `stockfish` npm package (stockfish.js), lite single-threaded ~7 MB build in a Web Worker — avoids COOP/COEP header hassle. Weaken for sub-1200 play with Skill Level 0–5 + node caps + MultiPV softmax pick; `UCI_Elo`'s real floor is 1320 and plays weirdly, so don't rely on it alone.
- **Opening data**: lichess/chess-openings TSVs — CC0, eco/name/pgn columns; recognize openings via an EPD map taking the last named position.
- **Puzzles**: `lichess_db_puzzle.csv.zst` — CC0, 6.06M puzzles, no account needed; filter Rating 600–1300 + beginner themes into SQLite.
