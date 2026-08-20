---
title: Next rung — scan the last 10 games for what's missing to the next milestone
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Daniel: "i want a feature that scans my last 10 games and tells me what im
missing in order to get to the next elo checkmark."

The milestone ladder (018) already shows the next rung and the trend, and
analysis (016/035) already produces per-game accuracy, the chess.com move
taxonomy and the left-book signal — but nothing measures *his* numbers against
what the next rung actually takes. "Coach says" picks the single next action;
this is the standing gap list behind it.

## Plan

- **Scan set**: the last 10 rated games in the milestone's headline time class
  (rating goals are per class; sparring is unrated and stays out). Reuse the
  stored analyses; anything unanalyzed is scanned on demand with the existing
  `analyzeGame` walk at `MOVE_MS`, one game at a time with progress.
- **Band table**: what a player at a given rating produces — accuracy,
  blunders, mistakes — linearly interpolated to the next rung. Tuned to
  lichess's open accuracy formula (analyze.ts), which runs a few points under
  chess.com's CAPS.
- **Gaps**: blunders, mistakes+misses, accuracy, out-of-book share (no line
  matched or he left first), and conversion (reached a winning position and
  didn't take the point). Each carries his number, the target, and a deep-link
  into the mode that fixes it.
- **Voice**: the top gap goes through the existing `coachPitch` — no new coach
  code, no new prompt surface (ADR 0001: code decides, the LLM phrases).

## Resolution

Shipped as `src/modes/NextRung.tsx` (logic + mode in one file, like
`TrapCards`/`Spar`), a home ledger row above Line drill, and selftest coverage.
No new CSS — the screen reuses `.climb`/`.coachcard`/`.ledger`.

- **Rates are per 100 of his own moves, not per game.** Per game was the
  obvious unit and measurably the wrong one: his games end in 8 moves as often
  as 80, and a player who is already lost can't drop another 30 win%, so bad
  games under-count. Accuracy is weighted by move count for the same reason —
  a two-move loss shouldn't count as much as an 80-move grind.
- **The 400 rung is measured, not guessed**: 11 analyzed games at rating ~390
  give 72% accuracy, 3.6 blunders and 5.1 mistakes per 100 moves. The climb
  from there to 2200 is a plausible monotone curve; refit any rung the same way
  once there are games at it. The first table was per-game and ~4× off.
- `gapReport(scanned, next)` ranks by relative shortfall (`(mine - target) /
  target`), so unlike metrics order on one scale. Knobs: `BOOK_SHARE` 0.5,
  `WINNING_WIN` 80 win%, `CONVERT_RATE` 0.7.
- **Nothing below the next rung? Measure against the one after it** and say so
  — at his end of the ladder an empty report is a clamping artefact, not news.
- Rows he already clears aren't dropped, they become a one-line footer
  ("already at 400 pace: mistakes 5.1/100 (≤5.2) · accuracy 73% (≥71%) …"), so
  the whole scan is visible and a one-gap report still reads as a scorecard.
- Games missing a fresh analysis get a "Scan the N unanalyzed games (~Xs)"
  button; the report renders over whatever is scanned and grows as each lands.
- Gap sentences are written for an 8B model: "you blunder 4.0 times per 100
  moves; a 400-rated player blunders about 3.6". The first phrasing ("400 play
  hangs about 3.6") had the voice inventing "costing you 40 points"; only the
  failing rows are fed to it, never the met ones.

Verified live on his real archives — all 10 rated rapid games scanned in the
mode, numbers re-derived independently from `analysis.json` and matching:
4.0 blunders/100 (target 3.6, the one gap), 5.1 mistakes/100, 73% accuracy,
out of book in 2 of 10, 5 of 6 winning positions converted. Selftest all green,
tsc clean.
