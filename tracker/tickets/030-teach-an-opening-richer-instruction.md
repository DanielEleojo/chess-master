---
title: Teach an opening — richer instruction on existing lines
type: grilling
status: closed
assignee: baba
blocked-by: []
---

## Question

Daniel: "let's add a way to teach an opening." Ambiguous on arrival — could
mean bringing a new opening into the trainer (outside the three systems),
reopening 012's rejected watch-first pass, or deepening the instruction
already on the three systems' lines. Which, and what does it look like?

## Resolution

**Richer instruction on the lines already in the repertoire** — not
new-opening intake, not reopening 012.

- Two surfaces, one authored content source: a new **Learn** mode on Home
  (system picker → per-system overview: plans, typical pawn breaks, key
  squares — text only, no diagrams) and, inside Line Drill, the existing
  per-move why-comment gains a second, longer field shown *alongside* it,
  always expanded (no click needed).
- Content is hand-authored, like the why-comments — never LLM-generated
  live, so ADR 0001's fact-layer/voice split stays intact.
- All three systems (Italian, Caro-Kann, Slav) get this in one pass, no
  pilot-one-first.
- Stored in a new `data/learn.json` keyed to systems and moves;
  `repertoire.pgn` and its comment syntax stay untouched.
- Split into an authoring ticket and a build ticket, matching 010→011:
  [031](031-author-learn-content.md) then [032](032-build-learn-mode.md).
