# 0001 — Coach: deterministic brain, local LLM voice

Status: accepted (2026-08-04)

## Context

Chess Master's destination includes an adaptive coach that explains why moves fail
and steers practice toward Daniel's weaknesses. An LLM is the obvious way to get
coach-quality prose, which invites letting it also *decide* — what to recommend,
what counts as a weakness, even what the engine lines mean. The available model is
a local 7B (Ollama, free, offline-capable); cloud APIs were ruled out (cost,
account, online dependency). Small models phrase well but compute chess badly and
recommend nonsense with confidence.

## Decision

The Coach is split into a deterministic brain and an LLM voice:

- **Facts and picks are code.** A local fact layer (chess.js over engine PVs)
  computes what a flagged move actually loses; a deterministic priority ladder
  over Daniel's data picks the practice recommendation. Both are selftest-able.
- **The LLM only phrases.** The coach voice (Ollama, qwen2.5:7b-instruct) turns
  already-computed facts and picks into prose. It never computes chess, never
  chooses recommendations, and the app degrades to facts-only text when Ollama
  is unavailable.

## Consequences

- Coach behavior is reproducible and testable; a bad recommendation is a code bug,
  not a model mood.
- Explanation quality is capped by the fact layer — the voice can only articulate
  what the facts capture, so improving coaching means enriching facts, not prompts.
- Swapping the model (bigger local, or cloud later) changes tone, not behavior.
- The rejected alternative (LLM decides from a stats digest) would feel more like
  a real coach but is unverifiable; revisit only if the fact layer provably can't
  express what needs coaching.
