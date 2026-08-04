---
title: Build fact-grounded coach Q&A
type: task
status: closed
assignee: claude
blocked-by: [027]
---

## Question

027's design, built: a two-button menu ("what if I played X?" / "what's the
idea here?") appended to `CoachNote` in Analysis (`src/modes/Analysis.tsx`).

- "What if X" — board goes interactive while a flagged move is shown
  (currently static, `movable: { free: false, dests: new Map() }`); a click
  tries the move, `engine.evalFen` runs on the result, `computeFacts` (from
  `src/lib/facts.ts`) runs on the hypothetical the same way it runs on the
  real played move today.
- "What's the idea" — re-runs `coachSay` (`src/lib/coach.ts`) over the
  flagged move's already-computed facts with a "why the best move works"
  framing; hidden when those facts are only the generic positional fallback
  sentence (`computeFacts`'s last branch, "Nothing hangs — the cost is
  positional...").
- Both reuse the existing facts-only-when-offline fallback already in
  `CoachNote`.
- Analysis only — Line Drill's whynot panel is out of scope for this ticket.

## Resolution (2026-08-04)

Shipped, both buttons live in `CoachNote` (`src/modes/Analysis.tsx`).

**"What if I played X?"** toggles the board interactive for the flagged
move's position (`destsOf` from `components/Board.tsx`, reused as-is) —
click a piece then a square, auto-queen on promotion, same as `drill.ts`'s
existing no-picker convention. The handler (`tryWhatIf`) mirrors LineDrill's
`explainMiss` exactly: eval the tried move and the engine's already-known
best move at equal depth (`WHY_MS` = 500ms, same budget), then hand both
lines to the unchanged `computeFacts`. Every click re-evaluates fresh from
the flagged position — not cumulative — so each hypothetical is independent.
Toggling off, jumping to a different flagged move, or leaving the game all
close it and clear the result via one reset effect keyed on `[p, sel]`.

**"What's the idea here?"** re-runs `coachSay` over the same `useMemo`'d
facts already on screen, now with a `framing: 'idea' | 'fail'` parameter
added to `coachSay` (`src/lib/coach.ts`) — 'idea' swaps the closing
instruction to explain the better move without restating why the played
move fails. Hidden when `facts` is exactly the one generic positional
fallback line — nothing concrete to reframe, matching 027's call. In
practice the reframed prose still leans on "why X fails" content when
that's most of what the fact layer has to offer for a given position — an
accepted limit of facts.ts's vocabulary (027 flagged the same gap), not a
bug in the framing switch.

Verified live: opened an analyzed bullet game, flagged move 8 `e5?` (best
`Nb6`). "What if" against `Nb6` itself (facts read as roughly a wash, since
it's the same move) and against `h6` (facts: "Nb6 keeps building... while h6
hands back about 0.2 pawns", then coach prose matching) both computed and
rendered correctly, board took the click, busy → coach-voice states
transitioned. "What's the idea" produced a distinct, correctly-framed
response, cached separately from the auto-explanation (`idea:` key vs
`{uuid}:{ply}`) so revisiting doesn't re-hit the model. Clicking a different
flagged move in the miss list reset both panels and re-locked the board;
clicking the board with what-if off did nothing. `?selftest=1` itself still
renders blank — the pre-existing, already-tracked crash (028), unrelated;
verified through normal navigation instead, same as 024/032.

`npx tsc --noEmit` clean.
