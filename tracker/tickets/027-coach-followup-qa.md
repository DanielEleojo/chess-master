---
title: Fact-grounded coach Q&A
type: grilling
status: closed
assignee: baba
blocked-by: []
---

## Question

023: "ask the coach anything," but constrained so it can't break ADR 0001 —
the voice must keep only phrasing facts computed by code, never inventing
chess content. Scoped to follow-ups on the position already on screen.

Open questions for the next grilling pass: what `facts.ts` doesn't compute
today that a natural follow-up would need (e.g. "what if I'd played X
instead" — a hypothetical the current fact layer never evaluates); where the
Q&A surface lives (inline under the existing narration, a new panel); how a
question outside the fact layer's coverage degrades (declines to answer vs.
falls back to the existing narration).

Lower priority than 024/025 — Daniel confirmed "defer it, same as push
notifications."

## Resolution

**A fixed two-button menu appended to the existing `CoachNote` panel in
Analysis, both grounded in facts the code already computes or can compute the
same way it computes them today.** No free text — nothing for the coach
voice to go off-script on, so ADR 0001 holds structurally rather than by
prompt discipline.

- **"What if I played X?"** — the board goes interactive while a flagged
  move is shown (it's static today); clicking a piece and a destination
  square tries that move, `engine.evalFen` runs on the result live (same
  latency Line Drill's "why not my move?" already pays), and `computeFacts`
  runs on the hypothetical exactly as it does for the real played move. Any
  legal move, not just the engine's own shortlist — `evalFen` only returns
  one line today and adding MultiPV for a shortlist buys nothing a board
  click doesn't already cover.
- **"What's the idea here?"** — no new fact-layer vocabulary. Re-runs
  `coachSay` over the *same* facts already computed for the flagged move,
  with a "why the best move works" framing instead of "why yours fails."
  facts.ts has no strategic categories (center/development/space) beyond the
  one generic positional fallback sentence — building those was flagged and
  explicitly deferred, same as 012's don't-build-ahead-of-evidence call.
  Button is **hidden** when the flagged move's only fact is that generic
  fallback — there's nothing concrete to reframe, and an LLM re-wording a
  contentless sentence is the drift ADR 0001 exists to prevent.
- **Surface**: Analysis only. Line Drill's whynot panel is fast-streak
  pacing where a what-if would break flow; it can inherit this later if
  Analysis proves it out, same pattern 013/014/022 used.
- **Degrade**: both reuse the existing facts-only fallback already in
  `CoachNote` when the coach voice is offline — not a new decision, the
  pattern's already established.
- **Dropped from v1**: "go deeper" on the punish/best line — low value,
  unrequested.

Build ticket spawned: 033.
