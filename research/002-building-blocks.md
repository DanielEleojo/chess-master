# 002 — Building Blocks for a Local Chess Training App

Researched 2026-08-03 against primary sources (GitHub repos, npm registry, official Stockfish docs, database.lichess.org).

## TL;DR

- **Board UI:** `@lichess-org/chessground` v10.1.1 — lichess's own board; framework-free, actively maintained, best-in-class drag/arrows. (You hand-roll a small promotion picker.)
- **Move logic/PGN:** `chess.js` v1.4.0 — TypeScript, grammar-based PGN parser; handles chess.com PGNs, but read `%clk`/accuracy comments yourself from `getComments()`.
- **Engine:** `stockfish` npm package v18.0.8 (nmrugg's stockfish.js), **lite single-threaded build (~7 MB)** in a Web Worker — no COOP/COEP headers needed. Weaken via `Skill Level 0–5` + node limits (UCI_Elo floors at 1320, too strong-ish and blunder-weird alone).
- **Openings:** `lichess/chess-openings` TSVs — CC0, ECO/name/moves, ~3.5k named lines; build an EPD→name map and match the last known position.
- **Puzzles:** `lichess_db_puzzle.csv.zst` from database.lichess.org — CC0, ~6.06M puzzles, plain CSV; filter `Rating <= 1200` + beginner themes offline, no account needed.

---

## 1. Board UI — recommend chessground

| Library | Latest | Status | Notes |
|---|---|---|---|
| `@lichess-org/chessground` | 10.1.1 (2026-03-27) | Active (lichess production, 2,000+ commits) | Zero deps, ~10 KB gzip, vanilla TS |
| `cm-chessboard` | 8.12.19 (2026-07-22) | Active (solo maintainer) | SVG, ES6, extension system |
| `chessboard.js` (oakmac) | 1.0.0 (2019) | **Abandoned** — author moved to chessboard2; requires jQuery; 91 open issues | Avoid |
| `chessboard2` | alpha | Still "in development" since 2023, ClojureScript build | Avoid |

- **Chessground** ([github.com/lichess-org/chessground](https://github.com/lichess-org/chessground), [npm](https://www.npmjs.com/package/chessground)): no dependencies, custom DOM-diff renderer, works in any framework or none — ideal for a vanilla/Vite app. Built-in: click-move and drag-drop with premove support, last-move/check highlights, **user-drawable SVG arrows and circles that snap to valid moves**, programmatic shapes (`setAutoShapes`) for showing engine/opening hints, animations. It contains *no chess rules* — you feed it legal-move maps from chess.js. **Promotion is not handled**: you detect a pawn reaching the last rank and show your own 4-piece picker (the standard, well-trodden pattern; lichess's own UI does this outside chessground). License **GPL-3.0+** — fine for a personal/local tool; only matters if you distribute without source.
- **cm-chessboard** ([github.com/shaack/cm-chessboard](https://github.com/shaack/cm-chessboard)): MIT-licensed, actively released through July 2026, and ships **extensions for Arrows, Markers, Accessibility and a PromotionDialog** — the credible runner-up if you want promotion UI for free and a permissive license. Drag UX and theming are a notch below chessground.

**Recommendation:** chessground. It is the board every lichess user already knows, the arrow/highlight API maps directly onto "show me the opening move / the blunder" training features, and it has the strongest maintenance guarantee (lichess depends on it). Fallback: cm-chessboard if GPL or DIY promotion is a dealbreaker.

## 2. Move logic / PGN — chess.js v1

- Current: **v1.4.0** (npm, published 2025-06-14; verified via npm registry). v1.0.0 (2024) was the big TypeScript rewrite; **v1.3.0 replaced the ad-hoc PGN parser with a grammar-based (PEG) parser**, and v1.3.1 fixed castling-with-check-annotation parsing. Releases: [github.com/jhlywa/chess.js/releases](https://github.com/jhlywa/chess.js/releases).
- Chess.com-exported PGN fidelity:
  - **Headers** (Event, Site, ECO, TimeControl, EndTime, etc.): parsed fine; `header()` returns all tags, Seven Tag Roster ordering preserved.
  - **Clock annotations** `{[%clk 0:02:58.1]}`: **not parsed into structured data** — chess.js treats them as opaque move comments (open request since 2021: [issue #261](https://github.com/jhlywa/chess.js/issues/261)). They survive `loadPgn()` and are retrievable per-position via `getComments()`; extract times with a one-line regex on the comment strings.
  - **Accuracy/analysis comments** chess.com sometimes embeds: same story — kept as comments, yours to regex.
  - Default non-strict mode is permissive about sloppy notation (missing `x`, `0-0`), which matches real chess.com exports. **Limitation:** chess.js does not model variations (RAVs); for mainline games and drills that's fine. If you ever need variation trees, `@mliebelt/pgn-parser` is the specialist ([github.com/mliebelt/pgn-parser](https://github.com/mliebelt/pgn-parser)).

**Recommendation:** chess.js v1.4.0. It's the de-facto standard, pairs 1:1 with chessground (`moves({verbose:true})` → `dests` map), and its PGN parser is now grammar-based and robust for chess.com exports.

## 3. Engine — stockfish npm (stockfish.js), lite single-threaded build

Candidates:
- **`stockfish` npm v18.0.8** (2026-06-15) = nmrugg/stockfish.js, the engine chess.com uses in-browser; tracks Stockfish 18. Ships 5 builds: large multi-threaded (>100 MB, needs cross-origin isolation), **lite single-threaded (~7 MB NNUE, needs nothing special)**, large single-threaded, lite multi-threaded, asm.js fallback. Load as a Web Worker, talk plain UCI strings. [github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3.
- **`lila-stockfish-web` / `@lichess-org/stockfish-web` v0.4.2** (2026-07-13): current and maintained, but built for lichess's multi-build/multi-variant loader — the README itself says it "is not straight-forward to load and use". [npm](https://www.npmjs.com/package/lila-stockfish-web)
- **`stockfish.wasm` / `stockfish-mv.wasm`** (niklasf): frozen at Stockfish ~14 era; superseded by lila-stockfish-web. Avoid for new work.

**Recommendation:** `stockfish` npm, lite single-threaded flavor. One worker file + one ~7 MB wasm, zero special HTTP headers (matters for a small local server), current engine. Single-threaded "lite" is still vastly stronger than any sub-1200 human — depth is not your problem, weakness is.

### Making it believably weak for a sub-1200 player
Sources: [Stockfish UCI docs](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html), [FAQ](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html), [issue #4418](https://github.com/official-stockfish/Stockfish/issues/4418).

- **`UCI_LimitStrength` + `UCI_Elo`**: real minimum in current Stockfish is **1320** (range 1320–3190, default 1320). 1320 is already at/above your user's level, the calibration is against engine pools (not chess.com Elo), and low-Elo mode plays oddly — near-perfect moves punctuated by senseless blunders (see [issue #6356](https://github.com/official-stockfish/Stockfish/issues/6356): limited-strength SF failing KR-vs-K mates). Not sufficient alone.
- **`Skill Level`** (0–20, overridden by UCI_Elo if both set): below-1320 territory. Internally SF picks ≥4 candidate moves (MultiPV) and applies a randomized bias favoring worse moves as the level drops. **Skill 0–3 ≈ beginner-ish**; roughly Skill 5 ≈ the 1320 floor.
- **Search limits**: send `go nodes 20000`–`go nodes 100000` (or `depth 4–8`) instead of long time controls. Low node counts produce genuinely human-ish oversights, and combine multiplicatively with Skill Level.
- **MultiPV + weighted random pick** (the technique behind most "human" bots): run `MultiPV 4–8` at modest depth, then choose among the returned lines with a softmax over centipawn scores (temperature = difficulty knob). Gives smooth, tunable strength and avoids SF's "perfect then random lobotomy" texture. This is the recommended approach layered on Skill Level 0–5 + node caps.
- Also add non-engine humanizers: small random think delays, and occasionally forbid the top move in dead-won positions.

## 4. Opening data — lichess/chess-openings

- Repo: [github.com/lichess-org/chess-openings](https://github.com/lichess-org/chess-openings). **License: CC0 (public domain)**.
- Format: five TSVs by ECO volume (`a.tsv` … `e.tsv`), columns **eco, name, pgn**; the build step also derives UCI moves and **EPD** per line. ~3.5k named lines, names as "Family: Variation, Subvariation" (e.g. "Sicilian Defense: Najdorf Variation, English Attack"). Fetch raw files straight from GitHub and vendor them (tiny).
- This is the dataset lichess itself uses. Recognition algorithm (also how lichess does it): precompute EPD→(eco,name) for every line, then walk the game's positions and keep the **last** position that matches — this handles transpositions correctly.
- Alternatives considered: SCID .eco files (older, GPL, clunkier format), `eco.json` mirrors (just repackaged lichess data, often stale). Nothing beats the source. For *drillable lines*, the TSV's `pgn` column is directly playable move-by-move against chessground/chess.js; augment with the free [lichess opening explorer API](https://lichess.org/api#tag/Opening-Explorer) if you later want "what do 1200s play here" stats (no account required).

**Recommendation:** vendor the lichess/chess-openings TSVs; build the EPD map at startup.

## 5. Puzzles without an account — lichess puzzle CSV

- Download: [database.lichess.org](https://database.lichess.org/#puzzles) → `lichess_db_puzzle.csv.zst` (Zstandard-compressed CSV; decompress with `zstd -d`). **License: CC0 1.0 Universal** — explicit permission for any use, no account or API needed.
- Size: **6,057,356 puzzles** (as of the current dump; grows monthly). Compressed download is a few hundred MB; expanded CSV ~1 GB — preprocess once into SQLite or filtered JSON, don't ship raw.
- Columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags, DailyDate`.
  - **FEN is the position *before* the opponent's move**; the first move in `Moves` (UCI format, space-separated) is the opponent's — you apply it, then the solver plays from move 2 onward. All solution moves are "only moves" (except any-mate on mate-in-1s).
  - `Rating`/`RatingDeviation`: Glicko2, from real solver attempts. `Themes`: space-separated tags (`mateIn1`, `mateIn2`, `fork`, `pin`, `hangingPiece`, `backRankMate`, `endgame`, …). `OpeningTags` names the opening for early-game puzzles — nice tie-in with §4.
- Filtering for an under-1200 player: `Rating BETWEEN 600 AND 1300`, `RatingDeviation < 100`, `Popularity > 70`, then bucket by theme (start with mateIn1/mateIn2/hangingPiece/fork). That still leaves hundreds of thousands of high-quality puzzles — sample a few thousand per theme into the app's local store.

**Recommendation:** one-time download + a preprocessing script into SQLite/JSON keyed by rating band and theme. Zero runtime dependency on lichess.
