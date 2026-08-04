---
title: Fact-grounded coach Q&A
type: grilling
status: open
assignee:
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
