---
title: Extend a left line — auto-append plies or propose to Daniel?
type: grilling
status: closed
assignee: baba
blocked-by: []
---

## Question

003 wants repertoire lines to deepen where real games leave book, and the signal chain now exists end-to-end: 016 records the departure (line, ply, who left, expected move) and 018's coach calls a line left early ≥2 times a Weakness and points Daniel back at it. But re-drilling the same 5-ply seed doesn't fix "the game outlived my book" — the line itself must grow.

Decide the extension mechanism:

- When the coach flags a left line, does the app **auto-append** plies (from what? engine best? the moves opponents actually played in those games?) or **propose** an extension Daniel accepts/edits?
- How many plies per extension, and does the grace-first-attempt rule (012) apply to the new tail?
- Where does the extension live — edited into `data/repertoire.pgn` (one source of truth, survives re-seed?) or layered separately?

Evidence to grill against: the departures recorded in `data/analysis.json` (which lines, which plies, opponent moves at the break point).

## Resolution

**Propose, don't auto-append — and split the triggers by who left.**

The evidence reframed the ticket: of 4 analyzed games, 2 departures were by the *opponent* (Italian ply 5, Slav-vs-London ply 4) and only 1 by Daniel (Caro-Kann, forgot Bg4). Different diseases, different cures:

- **Daniel left** → memory slip; re-drill fixes it. The existing 018 left-line rung already handles this. **No extension.**
- **Opponent left** the same line ≥2× → the repertoire lacks a branch for a move he actually meets → propose a **branch**.
- **Game outlived the line** ≥2× (matched to the end, kept going) → propose a **tail**. Note: `bookWalk` currently returns `leftAtPly: null` for this case and [recommend.ts](../../src/lib/recommend.ts) only counts `by === 'me'` — the two extension cases need a new coach rung; today they're invisible.

Mechanism, as decided:

- **Propose with one-click accept/dismiss** on the coach card — the proposal shows the concrete moves and why; nothing edits the repertoire behind his back. No in-app editing (hand-edit the PGN if ever needed).
- **Ply source**: opponent's side = the move opponents *actually played* at the break (majority across triggering games); Daniel's side + follow-up = Stockfish best, run deeper than analysis mode's 300ms. Same mechanism for branch and tail.
- **Length**: 4 plies per extension (their move, his reply, expected follow-up, his reply), exported as a knob alongside the 018 thresholds. Repeat triggers grow it again.
- **012 grace applies to the new tail**: first miss on a ply beyond the pre-extension length is unrecorded (teaching/requeue unchanged) — new plies are a cold start. Needs the line's pre-extension length stored.
- **Storage**: accepted extensions are written into `data/repertoire.pgn` itself — the one source of truth every reader already parses; it's git-tracked, so each extension is an inspectable, revertible diff. No layering.
- **Dismissal = gone until new evidence**: record the dismissed surprise as (line, break ply, opponent move); only a *new* game re-hitting the same break re-proposes it.

Build ticket spawned: [020-build-line-extension.md](020-build-line-extension.md).
