---
title: Coach gets an edge — tone rewrite + inactivity nudge
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

023 decided the Coach's baseline voice moves off "friendly" to rigorous,
with a blunter escalation for real severity, and that the "Coach says"
ladder gains a top rung for prolonged inactivity. Neither is built.

## Scope

- `coach.ts`: rewrite the `coachSay`/`coachPitch` system prompts off
  "friendly chess coach" to a rigorous baseline (states the mistake and the
  fix, no encouragement, no exclamation points). Thread `severity` through
  so a `'blunder'`-flagged move gets the blunter register; a `'mistake'`
  stays at baseline.
- Trap misses: escalate only on a *repeat* miss on the same trap (existing
  `{seen, missed}` stat in `drill-history.json`, same ≥1/3-rate convention
  `recommend.ts` already uses elsewhere) — never on a first-ever miss
  (ticket 012's grace).
- `recommend.ts`: new top rung ahead of "unanalyzed games" — last session
  timestamp vs. today, knob for the day threshold, evidence string names the
  days elapsed and (if one exists) the weakest still-open thread.

## Not in scope

Push notifications (026), conversational Q&A (027), any goal-setting UI
(023 dropped it).

## Resolution

Shipped:

- `coach.ts`: both prompts rewritten off "friendly" to a rigorous baseline
  (`persona()`); new `Register = 'plain' | 'harsh'` threaded through
  `coachSay`/`coachPitch` as a 4th param.
- `Analysis.tsx`: `coachSay` now passes
  `bl.severity === 'blunder' ? 'harsh' : 'plain'` — a `'mistake'` stays at
  baseline, a real blunder gets the blunter register.
- `recommend.ts`: `pickNext` now wraps the existing ladder (renamed
  `nextByEvidence`) with an inactivity check —
  `INACTIVITY_DAYS = 5` against the last `history.sessions` entry, outranks
  even unseen games, folds the underlying pick's mode/focusLine/evidence in
  rather than replacing it (`Back after N days — <what it would've said>`).
- `CoachCard.tsx`: `register` is `'harsh'` for `kind === 'weak-drill'` or
  `'inactive'` — both structurally require repeat evidence
  (`WEAK_STAT_MIN = 2`, or the days-elapsed gate), never a first-time miss.
- **Scope refinement**: the ticket's "repeat trap miss" escalation is
  implemented via the existing `weak-drill` rung (which already requires
  ≥2 misses by construction — a first miss can never reach it) rather than
  as new narration inside `TrapCards.tsx`, which never called the LLM voice
  before this and wasn't asked to start. The escalation applies uniformly to
  any weak-drill pick (lines, traps, or puzzles alike), not traps
  specifically, since the underlying "you were shown and it's still
  happening" logic is identical for all three.
- `Selftest.tsx`: 3 new checks cover the inactivity rung (leads the ladder
  and folds in the fallback pick, outranks unseen games, doesn't fire when
  recently active).

Verified:

- `npm run check` (tsc, both configs) clean.
- `pickNext`'s inactivity branch and `coach.ts`'s register-aware prompt
  construction both verified directly against the running dev server (module
  import + call, `window.fetch` stubbed to capture the outgoing prompt) —
  confirmed the harsh prompt text actually differs from plain, and the
  inactivity pick's title/evidence/mode fold correctly.
- Home's Coach card verified live in the browser with the new tone: *"You
  need to focus on the 12 new games you haven't reviewed yet; these contain
  mistakes that are preventing you from reaching your rating goal of 400."*
  — plain register, no "friendly" phrasing, no exclamation points.
- **Could not click through** Selftest or Analysis mode's live blunder
  narration in the browser: `?selftest=1` crashes on load. Confirmed via
  `git stash` that this reproduces identically with none of this ticket's
  changes applied — pre-existing, unrelated. Root cause and fix spawned as
  [028](028-selftest-crash-on-load.md), not fixed here.
