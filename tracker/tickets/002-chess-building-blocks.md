---
title: Off-the-shelf chess building blocks for a local web app
type: research
status: open
assignee:
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
