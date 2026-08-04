---
title: Puzzles ratchet difficulty like Spar
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

023: Puzzles mode is pinned to a fixed `BAND = (600, 1300)` in
`scripts/build-puzzles.py` forever, unlike Spar's rung ladder which
permanently raises the floor on 2 wins and never regresses. Bring Puzzles in
line.

## Scope

- Define the "consistently strong" trigger on the current band (mirrors
  Spar's win-streak-retires-a-rung shape — needs its own threshold, likely a
  hit-rate over a rolling window rather than Spar's binary win/loss).
- Raise the served band once triggered; never lower it. Persist the same way
  Spar's rung is (`localStorage['cm.rung']` precedent).
- `data/puzzles.json` is a static, pre-filtered deck built by the Python
  script at a fixed band — decide whether the ratchet re-filters a wider
  pre-built deck client-side, or whether the deck needs rebuilding with a
  wider band and client-side filtering by current floor/ceiling.

## Resolution

Shipped:

- `scripts/build-puzzles.py`: `BAND` widened from `(600, 1300)` to
  `(600, 2000)`, `PER_DECK` raised 30 → 60 (checked candidate density first —
  every deck still has 100+ puzzles at the top floor). Rebuilt
  `public/data/puzzles.json` from the local dump: 720 puzzles, same 12
  decks. One deck, no rung-specific rebuilds — the ratchet re-filters this
  one wider deck client-side, the simpler of the two options in scope.
- `src/lib/puzzles.ts`: `PCard` gets an optional `rating` (lichess puzzles
  set it, his own blunder cards leave it unset so they always pass the
  floor filter).
- `src/modes/Puzzles.tsx`: a `FLOORS` ladder
  (`[600, 850, 1100, 1350, 1600]`, picked so every rung still has 100+
  servable puzzles), mirroring Spar's `RUNGS`/`WINS_TO_CLIMB` shape as
  closely as the domain allows — `DEALS_TO_CLIMB = 2` strong deals
  (`STRONG_HITRATE = 0.8`) retires a floor for good, persisted to
  `localStorage['cm.puzzleFloor'/'cm.puzzleStrong']`. Like Spar's `wins`, a
  weak deal doesn't reset the streak, it just doesn't add to it. `ownOnly`
  deals (the coach's own-mistakes deep link — no band puzzles in them at
  all) don't count toward the ratchet and don't show the floor badge.
  `ModeHead`'s `right` slot shows `<floor>+ · <strong>/2`, same spot Spar
  uses for its rung badge.
- **Scope refinement**: no dynamic ceiling. The build-time band's top
  (2000) already bounds difficulty; only the floor climbs. "Current
  floor/ceiling" in the scope note above is satisfied by floor-only — nothing
  in 023's ask implies capping how hard a puzzle can get.

Verified:

- `npm run check` clean.
- Live in the browser: fresh session shows `600+ · 0/2`; a scripted 10/10
  deal (own-mistake cards + lichess puzzles, driven via the `cmMove`/
  `cmExpected` dev hooks) advanced `cm.puzzleStrong` 0 → 1 without moving
  the floor, matching `DEALS_TO_CLIMB = 2`.
- Home's Tactics row now reads 720 puzzles (was 360), confirming the
  widened deck loads.
- **False alarm, not a bug**: an early pass at scripting a full deal via
  `cmMove` polled faster than the app's 600ms opponent-auto-reply /
  800ms solved-transition timers, and the dev hook — meant for headless
  driving, doesn't check whose turn it is — let the script play the
  opponent's own queued move early, occasionally causing `finish()` to
  fire more than once for one deal (confirmed via `git stash`: reproduces
  identically on unmodified pre-025 code, so unrelated to this change).
  Slowing the script's pacing below those timers made it disappear. No
  app code changed for this; noted here so a future session doesn't
  rediscover it from scratch.
