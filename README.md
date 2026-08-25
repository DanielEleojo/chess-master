# Chess Master

A personal chess training app that turns my own games into the curriculum: it syncs my games from chess.com, finds my blunders with a local engine, and deals my own mistakes back to me as drills — with an LLM coach that explains *why* a move fails, grounded in facts computed by code.

![TypeScript](https://img.shields.io/badge/TypeScript-React%2019-blue.svg)
![Stockfish](https://img.shields.io/badge/Stockfish%2018-in--browser%20WASM-green.svg)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)

## The idea

Most chess apps drill random puzzles. This one closes the loop on *my* play:

1. **Sync** — pulls my games from the chess.com public API (monthly archives, diffed by game UUID)
2. **Analyze** — Stockfish 18 runs client-side in a Web Worker; eval swings past a threshold flag my blunders and mistakes
3. **Drill** — flagged positions come back as "own-mistake cards" in the tactics deck, alongside CC0 lichess puzzles filtered to my opening systems; repertoire lines are drilled move-by-move with an authored one-line "why" on every move
4. **Coach** — a deterministic priority ladder over my stats picks what to practice next; an LLM phrases the explanation as prose, but never computes chess — facts come from code (material hung, tempo lost, king safety), the model only articulates them

Design rule that shaped everything: **the LLM never decides, it only narrates.** Recommendations, blunder detection, and drill scheduling are deterministic and offline-capable; the coach voice is a presentation layer with a rigorous, no-cushioning tone.

## Training modes

| Mode | What it does |
|------|-------------|
| **Line Drill** | Repertoire sequences (Italian / Caro-Kann / Slav systems) drilled with graded misses — a first-ever miss is never punished in stats |
| **Trap Cards** | Single-position quizzes: find the punishing move against junk openings I actually face |
| **Puzzles** | Tactics ≤2 of my moves deep — lichess CC0 puzzles tagged to my systems, mixed with my own flagged mistakes |
| **Spar** | Engine sparring at calibrated strength |
| **Analysis** | Game review with coach narration on flagged moves and book-departure detection (which ply left my repertoire, and who left it) |
| **Next Rung** | Milestone ladder from my real rating toward the next target — progress measured from synced games, not vibes |

## Stack

- **Frontend**: React 19 + TypeScript + Vite, chessground board, chess.js rules
- **Engine**: Stockfish 18 lite compiled to WASM, running in a browser Web Worker — no server round-trip for analysis
- **Backend**: Cloudflare Worker serving the app, the coach API, and Web Push notifications (encrypted per-subscription with per-message salts) — a "doorbell, not the message" design so the push payload carries nothing sensitive
- **Docs-as-code**: [`CONTEXT.md`](CONTEXT.md) keeps a ubiquitous language for the domain; `docs/` holds ADRs and tickets

## Run it

```bash
npm install
npm run dev      # local dev via Vite
npm run check    # typecheck app + worker
npm run deploy   # build + wrangler deploy
```

---

Built by [Daniel Baba](https://linkedin.com/in/baba-daniel) — B.Sc. Computer Science (Math minor), Ontario Tech University.
