---
title: Do never-before-drilled lines get a watch-first intro pass?
type: grilling
status: closed
assignee: baba
blocked-by: []
---

## Question

Carried from 005: when a repertoire line enters the drill pool for the first time, does Daniel get a watch-first intro (the app plays the line through once with the why-annotations) before being quizzed on it — or does he meet it cold, learning through the explain-on-miss loop like everything else?

Small, pure UX preference. Does not block the build (011): until resolved, 011 defaults to cold-start (misses teach, per 005's miss-driven philosophy).

## Resolution

**Cold-start, with a stats-only grace on the first attempt.**

- No watch-first intro pass, and no optional "show me this line" peek — new lines are quizzed immediately, per 005's misses-teach philosophy. 011's default stands.
- **Grace first attempt** (the one refinement): a first-ever miss on a line is *not* recorded in `drill-history` — the explain-on-miss teaching and in-session requeue still happen, only the weakest-first stats forgive it. A first-attempt *hit* does count (grace is asymmetric: you only ever benefit).
- Implemented as one condition in `bump()` ([src/lib/history.ts](../../src/lib/history.ts)); covered by three new selftest assertions (all green).
