---
title: Give Analysis a review session module
type: task
status: open
assignee:
blocked-by: []
---

## Question

`src/modes/Analysis.tsx` is 828 lines and the codebase's hot spot — four of the
last six commits touched it. It has accumulated across 016 → 027/033 → 035 →
036 and now holds the game crosstable, the engine walk, the eval graph, the
`.ccr` chess.com skin, coach Q&A, watch-the-line playback, free exploration and
inline retry.

Raised by an architecture review over the whole repo. Filed rather than done:
the review's own recommendation was to wait until Analysis next grows, because
today's version works and the extraction is the largest single change on the
board.

## What to extract — and what not to

**Not** a component split. Breaking it into `<GameList>` / `<EvalGraph>` /
`<ReviewBoard>` fails the deletion test: it *moves* complexity into prop
drilling rather than concentrating it.

The part that concentrates is the **review session state machine** — which
game, which ply, watching a line or exploring freely, which variation and how
deep into it — currently spread across ~15 `useState`s with no name. Because it
has no name, none of it is checkable.

Mirror `src/lib/drill.ts`, the pattern this repo already established:

    makeReview(game, analysis)
      .atPly   .play(move)   .watch(line)   .back()

`drill.ts` is 83 lines, headless, and drives Line drill, Trap cards *and*
Tactics cards — three surfaces, one deep module. It's also where 034's real bug
turned out to live, and it was findable precisely because the selftest could
reach it.

## Why it pays

- Checks that can't exist today become ordinary selftest lines: "watch advances
  one ply at a time", "back() from the branch point restores the mainline",
  "exploring from ply N then back returns to ply N".
- `Analysis.tsx` drops to rendering.
- Same shape as `drill.ts`, so there's nothing new to learn.

## Trigger

Do it the next time Analysis needs a feature, not before. If that never comes,
this ticket is correctly unresolved.
