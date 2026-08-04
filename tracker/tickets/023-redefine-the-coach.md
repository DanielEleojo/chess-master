---
title: Is the coach up to par as a mentor?
type: grilling
status: closed
assignee: baba
blocked-by: []
---

## Question

22 tickets in, Daniel asked whether the app's Coach — narrating flagged moves
and the home "Coach says" card, per CONTEXT.md's existing narrow definition —
actually holds up as a coach/mentor, or whether that definition itself needs
to grow. Grilled against `coach.ts`, `recommend.ts`, `analyze.ts`, `facts.ts`,
`drill-history.json`'s stat shape, and the existing PWA manifest (no service
worker or push infra present anywhere in the codebase).

## Resolution

**The Coach's job grows in two ways and stays the same size everywhere else.**

Kept, deliberately:

- **Evidence-only ladder** — no user-set goals. Letting a stated intent
  override `recommend.ts`'s pick would reopen the "measured, not vibes"
  stance ticket 018 already took.
- **Positional/strategic teaching and endgame technique** — out of scope.
  Sub-1200 games are decided by tactics and blunders, not positional
  subtlety, and there's no deterministic fact layer for positional judgment
  the way there is for material/mate (ADR 0001) — revisit once the milestone
  ladder has him out of the sub-1200 band.

Growing now (build tickets spawned: 024, 025):

- **Tone** — `coach.ts`'s system prompt is "a friendly chess coach"; that's
  wrong. Baseline moves to rigorous/no-cushioning (states the mistake and the
  fix, no encouragement), escalating to a blunter register for
  `severity === 'blunder'` (≥250cp, not a mere `'mistake'`) and for a
  *repeat* miss on a trap — same grace as ticket 012's first-attempt rule,
  applied to voice instead of stats.
- **Proactive check-in** — a new top rung on the "Coach says" ladder: N days
  since his last session leads the card, in the harsh register. In-app only
  — fires when Daniel opens the app, doesn't reach him while he's away.
- **Puzzle difficulty ratchets** — `scripts/build-puzzles.py`'s
  `BAND = (600, 1300)` is a fixed constant today; Puzzles adopts Spar's
  philosophy (raise the band once he's consistently strong, never regress).

Growing later (design tickets spawned: 026, 027 — real infra/scope questions
still open, lower priority than 024/025):

- **Push notifications** — the version of the check-in that reaches him
  outside the app. No service worker, no Notification/Push API usage
  anywhere in the codebase today; would need one plus a Worker-side Cron
  Trigger (newly possible now that `worker/` deploys to a real domain).
- **Conversational Q&A** — "ask the coach anything," but scoped strictly to
  follow-ups on the position already on screen, answered only from facts
  `facts.ts` computes. Open-domain chess chat would break ADR 0001's "voice
  never computes chess" guarantee — not on the table.

CONTEXT.md's **Coach voice** entry updated to match. **Coach** and
**Coach says** definitions hold as-is — still exactly two surfaces; the
nudge lives inside the existing "Coach says" card, not a new one.
