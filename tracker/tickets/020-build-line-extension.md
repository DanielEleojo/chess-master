---
title: Build the line extension mechanism
type: task
status: closed
assignee: baba
blocked-by: []
---

## Question

Implement 019's decided mechanism end-to-end:

- **Signal**: extend `bookWalk`/`Analysis` so opp-departures carry the opponent's actually-played move at the break, and outlived-book (`ended` with the game continuing) is distinguishable from line-covered-it-all. Bump `ANALYSIS_V`.
- **Coach rung**: new extension rung in [recommend.ts](../../src/lib/recommend.ts) — opp-left same line ≥2× → propose branch; outlived same line ≥2× → propose tail. Proposal = opponent's majority real move + Stockfish best replies (deeper than analysis's 300ms), 4 plies, length as an exported knob.
- **Card UX**: proposal renders on the Coach says card with the moves and why; one-click accept / dismiss.
- **Accept**: append the plies into `data/repertoire.pgn` (branch or tail), store the line's pre-extension length so 012's grace covers first misses on new plies.
- **Dismiss**: persist (line, break ply, opponent move); re-propose only when a new game re-hits the same break.
- Selftest coverage for the new signal shape, rung, grace-on-tail, and PGN append.

## Resolution

Shipped end-to-end; verified live by injecting a synthetic double break, watching the card propose `3…d6 4.O-O Be7 5.d4`, accepting, and inspecting the git diff (then restoring the data).

- **Signal**: `BookInfo` gains `oppSan` (opponent's actually-played move at the break — deviation or first post-book move) and `outlived` (matched the whole line, game kept going). `ANALYSIS_V` → 4; stale caches re-analyze on open, and pre-v4 analyses are simply invisible to the rung until then.
- **Rung** ([recommend.ts](../../src/lib/recommend.ts)): sits *after* the Daniel-left re-drill rung (memory fix outranks book growth, per 019's cause split). Trigger logic lives in [extend.ts](../../src/lib/extend.ts): `findExtension` groups by **exact break** (line + ply + opponent move) — deliberately stricter than 019's "same line, majority move", because it makes the trigger key identical to the dismissal key; pool near-misses only if evidence someday demands it. Knobs exported: `EXTEND_MIN = 2`, `EXTEND_PLIES = 4`, `EXTEND_MS = 1500` (5× analysis depth).
- **Proposal**: opponent's real move first (when the break is on their turn), then engine-best for both sides in turn; computed on the Coach says card (~5s, "engine preparing the new moves…"), rendered with numbered SAN + Add to repertoire ✓ / Not now.
- **Accept**: `applyExtension` is pure text→text — a tail rewrites the line's chunk in place, a branch appends a new game named `<line> (<move> branch)` sharing the prefix; old why-comments survive, new user plies get a `coach extension` why (keeping 011's every-move-has-a-why selftest rule). Written via a new `PUT /api/repertoire` middleware route after client-side re-parse validation; the app reloads to re-seed. **Found while driving it**: the triggering analyses keep their old book info, so a bare accept re-proposed forever — an accept now also *parks* the break exactly like a dismissal (correct semantics for free: new games match the extended line, so only a genuinely new hit re-proposes).
- **Grace (012)**: `preLen[name]` stores the pre-extension ply count; LineDrill tracks the lowest missed ply per pass, and a miss landing entirely beyond `preLen` is forgiven once (`tailGrace` consumes the entry). Teaching/requeue untouched.
- **Dismiss**: `data/extensions.json` records (line, ply, oppSan, games-at-dismissal); the break sleeps until the analyzed-game count for that exact break exceeds it.
- **Selftest**: ~20 new checks (signal shape incl. outlived-vs-covered, branch/tail/priority/dismiss-sleep/re-propose, grace consumption, tail rewrite + branch append re-parsed with comments intact); seed-count checks relaxed to `>= 22` / `=== lines.length` since accepted extensions legitimately grow the file. All green, typecheck clean.
