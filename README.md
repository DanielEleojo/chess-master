# Chess Master

A personal chess training app that turns my own games into the curriculum: it syncs my games from chess.com, finds my blunders with a local engine, and deals my own mistakes back to me as drills — with an LLM coach that explains *why* a move fails, grounded in facts computed by code.

[![CI](https://github.com/DanielEleojo/chess-master/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielEleojo/chess-master/actions/workflows/ci.yml)
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
- **Docs-as-code**: [`CONTEXT.md`](CONTEXT.md) keeps a ubiquitous language for the domain, [`docs/adr/`](docs/adr) holds the architecture decisions, and [`tracker/`](tracker) holds the 37 tickets this was built through

## How it was built

Every feature here started as a ticket and ended as a line in a decision log. [`tracker/map.md`](tracker/map.md) is that log — one entry per closed ticket, written as *what was decided and why*, including the rejections. A few worth reading:

- [Which openings first?](tracker/tickets/003-which-openings-first.md) — derive the repertoire from games actually played, fill the gaps from a recommended sub-1200 set
- [Does a new line get a watch-first intro?](tracker/tickets/012-watch-first-intro-pass.md) — no; cold-start stands, softened only by not recording a first-ever miss
- [Is the coach up to par as a mentor?](tracker/tickets/023-redefine-the-coach.md) — dropped "friendly" for a rigorous baseline; ruled goal-setting and pawn-structure theory out of scope, because tactics decide these games
- [ADR 0001](docs/adr/0001-coach-rules-decide-llm-phrases.md) — the deterministic-brain / LLM-voice split, and what would have to be true to revisit it

## Run it

```bash
npm install
npm run dev      # local dev via Vite
npm test         # 150 checks, no browser needed
npm run check    # typecheck app + worker
npm run deploy   # build + wrangler deploy
```

On first run it asks for a chess.com username, then syncs that account's games
into `data/` — which is gitignored, so the repo never carries anyone's stats.

`npm test` runs the same assertions the in-app selftest shows at
`?selftest=1`: repertoire and trap parsing, the drill engine walking every
card, book-departure detection, the accuracy and move-taxonomy math, the fact
layer, and the coach's recommendation ladder. The six that need a live server
or the Stockfish worker stay in the browser view.

## Deploying your own

The committed Cloudflare config is wired to one account. Nothing in it is
secret, but a fork has four values to replace in `wrangler.jsonc`:

1. `wrangler kv namespace create DATA` → paste the id over `kv_namespaces[0].id`
2. Replace or delete the `routes` custom domain
3. Generate your own VAPID pair for Web Push — public half into `vars`, private half via `wrangler secret put VAPID_PRIVATE_JWK`
4. Point `VAPID_SUBJECT` at your own contact address

> [!IMPORTANT]
> Put **Cloudflare Access** in front of the Worker before exposing it. Account
> data is keyed off the email header Access injects, and `accountId()` falls
> back to a single shared `dev@local` account when that header is missing — so
> a deploy without Access lets every visitor read and write the same data.

`scripts/migrate-to-kv.sh <namespace-id> <your-access-email>` seeds your first
account from local `data/`.

## License

[MIT](LICENSE). Puzzle and opening data are CC0 from lichess
(`public/data/puzzles.json`, `public/data/openings.tsv`); the repertoire and
trap PGNs are hand-authored — [ticket 008](tracker/tickets/008-repertoire-traps-data.md)
found no openly-licensed source for either, so nothing copyrighted is vendored.

---

Built by [Daniel Baba](https://linkedin.com/in/baba-daniel) — B.Sc. Computer Science (Math minor), Ontario Tech University.
