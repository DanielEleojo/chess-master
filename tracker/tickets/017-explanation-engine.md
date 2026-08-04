---
title: Explanation engine — fact layer + coach voice
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Build the two-layer explanation per the grilling of 2026-08-04 (see CONTEXT.md "Coaching" + ADR 0001):

- **Fact layer** (`src/lib/facts.ts` or similar): from a flagged move's before-FEN, played move, and engine PV, compute deterministic facts — material hung / won along the PV, mate threats, forks/pins revealed, tempo lost, king safety changes. chess.js only; selftest-able.
- **Coach voice**: Ollama at `localhost:11434`, model `qwen2.5:7b-instruct` (installed, service active). Prompt = facts + position context → 2-3 sentences of "why yours breaks the position, why the best move builds it". Never computes chess; facts-only text fallback when Ollama is down.
- **Surfaces**: auto for every flagged move in analysis; in drills a "why not my move?" button on a miss (engine-eval the attempted move vs the line move on demand — never auto, pacing is sacred).

Daniel reacts to prose quality; the knob is the prompt and the fact vocabulary, not model choice.

## Resolution (2026-08-04)

Built and verified live in the running app.

- **Fact layer** — `src/lib/facts.ts`: `computeFacts()` walks the engine's lines with chess.js and emits fact sentences: immediate "your piece can simply be taken", net material along the refutation (with recapture netting), forced mate, forks (turn-swap trick over the reply piece's attacks), multiple checks, castling thrown away by a bare king move, best-line material/mate, and a positional fallback quoting the eval swing. Vocabulary deliberately excludes pins and lost tempo (ponytail comment in file — add when Daniel's games show facts these words can't express). 8 new selftest checks cover every fact type; all green.
- **Refutation line now persists** — `Blunder.punishSan` (the engine PV *after* his move, previously computed and discarded in `analyzeGame`) is what "material hung" walks. `ANALYSIS_V` bumped to 3; stale caches re-analyze on open, verified live.
- **Coach voice** — `src/lib/coach.ts`: browser fetches Ollama directly (CORS for localhost origins confirmed live, no proxy); `qwen2.5:7b-instruct`, `keep_alive: 30m` (cold load costs ~30s; warm generation ~19s on this CPU), session-only prose cache so prompt tweaks stay visible. Returns null on any failure — the facts ARE the fallback text, per ADR 0001.
- **Analysis surface** — auto: viewing any flagged ply renders a "Coach on {move}" panel; facts appear instantly, prose swaps in with a "coach voice / thinking… / offline — facts only" tag. Verified on a real game: facts "e5 puts the pawn on a square the opponent controls — dxe5 just takes it", prose "…The engine prefers Be7 because it keeps the pawn structure sound."
- **Drill surface** — on-demand only: a "why not my move?" button appears on a legal-but-wrong miss; click runs two 500ms evals (tried vs line move), facts render, prose follows. When the engine shrugs (swing < 30cp — common, repertoire moves aren't always engine-best) the honest answer is discipline: "drilling means one answer: {move}" plus the line's why-comment. Prompt includes his color (first live prose confused sides without it) and the why-comment. Pacing untouched — nothing runs automatically.

Prose-quality knobs for Daniel: the prompt strings in `coach.ts`/both surfaces, and the fact vocabulary in `facts.ts`.
