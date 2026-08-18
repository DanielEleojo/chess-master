---
title: Teach on the board — play lines out, explore freely with engine replies
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Daniel on 035's review: "still very hard to follow, i need more use of the
actual chess board to explain things, like a teacher showing me what i did
wrong on the board and allowing me to make other moves in those analyses and
tell me what that could lead to like chess.com."

The teaching currently lives in prose (coach note, "because …" SAN strings)
while the board sits static with two arrows. chess.com's coach *plays the
lines on the board* and answers any move you make.

## Plan

- **Watch the line on the board**: on a flagged move, buttons "watch the
  right plan" (bestSan + pvSan) and "watch the punishment" (played move +
  punishSan) auto-play the line on the board move by move; ← → steps it
  manually, any game click exits.
- **Free exploration everywhere**: the board is always movable in review.
  Any move branches a variation from the viewed position: the engine evals
  it (WHY_MS), plays its reply on the board, and a one-line note says what
  it costs and where it leads ("e5 loses 2.5 (+1.8). Engine answers Nxe5 —
  then …"). Keep moving to go deeper; stepping back and moving truncates.
- **What-if retires**: 027's one-shot text what-if is replaced by the
  variation explorer — same engine budget, but the answer happens on the
  board. Retry (035) unchanged and still exclusive with exploring.

## Resolution

Shipped in `src/modes/Analysis.tsx` (+ a small `.varbar`/`.varnote` CSS block):

- A `Var` variation state branched off the viewed ply: `sans/ucis/fens/evals`
  plus a teacher `note`. The board renders the variation when one is open;
  the eval bar and number follow it.
- **Watch buttons** on flagged moves: "watch the right plan" (`pvSan`) and
  "watch the punishment" (`san + punishSan`) seed the variation and
  auto-step it on the board at 800ms per move; ← → steps manually (← past
  the start exits), clicking any variation move jumps.
- **Free exploration**: the board is now always movable in review. Any move
  branches from the shown position (mid-line moves truncate the tail),
  the engine evals it at WHY_MS, plays its reply on the board, and the note
  reads e.g. "Bb4 loses 3.9 — a blunder (+4.4). Engine answers exf6 —
  likely Bxc3 bxc3 Qxf6 Bd3. Your move." A `genRef` counter voids engine
  replies that land after the variation closed.
- 027's text-only "what if I played X?" retired — the explorer answers the
  same question on the board with the same engine budget. Retry unchanged
  and still exclusive (retryOn routes moves to the verdict instead).
- Seeded "watch it" plies get per-ply evals filled in behind the playback
  (WHY_MS each, terminal positions short-circuit to mate/draw values); each
  fill validates its fen so a mid-line branch can't be overwritten by a late
  result, and the step timer keys on the line's length so fills replacing
  the va object don't reset it.

Verified live: punishment line auto-played 8…e5 9.dxe5 Nb6 10.Bxf7+ Kxf7
11.Qb3+ on the board; mid-line branch (Bb4 at ply 2) truncated the tail and
got the engine reply above; h6 from the plain game view explored with
"h6 holds (+0.6). Engine answers Re1"; retry still passes on Nb6. tsc clean.
