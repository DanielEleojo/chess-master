---
title: Which openings should the trainer drill first?
type: grilling
status: closed
assignee: danielbaba029
blocked-by: []
---

## Question

What repertoire does the opening trainer teach Daniel first?

- Train the openings he *already plays* on chess.com (derive his actual repertoire from imported games) or adopt a recommended beginner repertoire — or a blend (fix what he plays, fill gaps with recommendations)?
- White, black, or both first?
- How deep: main lines to move 5–8, or 10+ with sidelines?
- How does he want to handle opponent deviations — "out of book" ends the drill, or the trainer teaches punishing common junk?

## Resolution

Grilled with Daniel 2026-08-03. Decisions:

- **Source: blend from the start.** A one-time bulk import of his chess.com archives (no dependency on the instant-sync design — just username + a fetch script) derives what he actually plays; sound lines are kept, gaps filled from a recommended sub-1200 repertoire.
- **Color scope: both from day one.** Depth stays shallow instead of cutting a color.
- **Depth: miss-driven only.** Lines seed at ~5 full moves and extend *only* where own-game analysis shows he actually left book in a real game. Accepted consequence: depth is frozen at seed depth until the analysis mode exists — analysis must emit "left book at move N" signals for the trainer to consume.
- **Deviations: teach punishing common junk**, sourced **both** ways — seeded from a curated classic-traps list (Scholar's mate, wayward queen, common gambits) for cold start, then taken over by junk mined from the off-book replies his real opponents play most at each repertoire position.

Surfaced follow-ups: ticket 007 (bulk archive import, task), 008 (research off-the-shelf repertoire/traps data), 009 (pick the gap-filling repertoire, blocked by 007+008). Ticket 005 (drill-flow prototype) is now unblocked.
