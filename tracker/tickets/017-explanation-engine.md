---
title: Explanation engine — fact layer + coach voice
type: task
status: open
assignee:
blocked-by: []
---

## Question

Build the two-layer explanation per the grilling of 2026-08-04 (see CONTEXT.md "Coaching" + ADR 0001):

- **Fact layer** (`src/lib/facts.ts` or similar): from a flagged move's before-FEN, played move, and engine PV, compute deterministic facts — material hung / won along the PV, mate threats, forks/pins revealed, tempo lost, king safety changes. chess.js only; selftest-able.
- **Coach voice**: Ollama at `localhost:11434`, model `qwen2.5:7b-instruct` (installed, service active). Prompt = facts + position context → 2-3 sentences of "why yours breaks the position, why the best move builds it". Never computes chess; facts-only text fallback when Ollama is down.
- **Surfaces**: auto for every flagged move in analysis; in drills a "why not my move?" button on a miss (engine-eval the attempted move vs the line move on demand — never auto, pacing is sacred).

Daniel reacts to prose quality; the knob is the prompt and the fact vocabulary, not model choice.
