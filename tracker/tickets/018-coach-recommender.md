---
title: Coach says — recommender + milestone ladder on home
type: task
status: closed
assignee: baba
blocked-by: [017]
---

## Question

Build the Coach's home surface per the grilling of 2026-08-04 (CONTEXT.md "Coaching", ADR 0001):

- **Priority ladder in code** picks what to practice next from real data: unanalyzed new games → a line he keeps leaving early (book departures in `data/analysis.json`) → blunder clusters → weakest drill/trap stats (`data/drill-history.json`). Deterministic, selftest-able; each pick carries its evidence.
- **Milestone ladder**: extract rating history from the synced PGNs (WhiteElo/BlackElo per game), show the trend and the next milestone (335 rapid → 400 → …); recommendations framed as "this is what's costing you points".
- **Coach voice** (from 017) phrases pick + evidence + milestone as the "Coach says" card; plain text fallback offline.

Open while building: how a Weakness is evidenced (how many repeats before the coach calls it), and whether the card deep-links straight into the recommended drill.

## Resolution (2026-08-04)

Shipped. The Coach says card now sits at the top of home.

- **Ladder** — `src/lib/recommend.ts` `pickNext()`: unanalyzed games → a line left early in ≥2 analyzed games (`LEFT_LINE_MIN`) → ≥3 flagged moves clustered in one game phase (`CLUSTER_MIN`, opening/middlegame/endgame by ply) → weakest drill/trap stat (≥2 misses at ≥1/3 rate, `WEAK_STAT_MIN`) → default reps. Pure function, every pick carries its evidence strings; 10 new selftest checks cover ladder order, thresholds, and fallbacks (all green).
- **Milestone ladder** — `ratingHistory()`/`milestone()` read the archive JSON's per-game `white/black.rating` (same numbers as the PGN's WhiteElo/BlackElo, no parsing), headline the most-played class (rapid, 237 games, currently 344), next stop from a fixed MILESTONES rung list (344 → 400), trend vs 10 games back (+38). Rated games only.
- **Voice** — `coachPitch()` in `coach.ts` (shares the generate/cache plumbing with 017's `coachSay`) phrases pick + evidence + milestone as "what this is costing you"; verified live against Ollama. Without it the card shows title + evidence plain — same information, no prose.
- **Open q 1 (Weakness evidence)**: 2 repeats for a left line, 3 for a blunder cluster, 2 recorded misses at ≥1/3 for drill stats — exported knobs at the top of recommend.ts, tune on reaction.
- **Open q 2 (deep-link)**: yes — the card's button jumps straight into the recommended mode, and a left-line/weak-line pick passes `focusLine` so LineDrill deals that line first. Verified in the browser (12 unseen → button lands in Analysis with the new games flagged).
- Note for 013: the blunder-cluster rung sends middlegame/endgame clusters back to analysis for now (`ponytail:` comment in recommend.ts) — when the tactics deck exists it should claim that rung's destination.
