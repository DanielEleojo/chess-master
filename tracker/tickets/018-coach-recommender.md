---
title: Coach says — recommender + milestone ladder on home
type: task
status: open
assignee:
blocked-by: [017]
---

## Question

Build the Coach's home surface per the grilling of 2026-08-04 (CONTEXT.md "Coaching", ADR 0001):

- **Priority ladder in code** picks what to practice next from real data: unanalyzed new games → a line he keeps leaving early (book departures in `data/analysis.json`) → blunder clusters → weakest drill/trap stats (`data/drill-history.json`). Deterministic, selftest-able; each pick carries its evidence.
- **Milestone ladder**: extract rating history from the synced PGNs (WhiteElo/BlackElo per game), show the trend and the next milestone (335 rapid → 400 → …); recommendations framed as "this is what's costing you points".
- **Coach voice** (from 017) phrases pick + evidence + milestone as the "Coach says" card; plain text fallback offline.

Open while building: how a Weakness is evidenced (how many repeats before the coach calls it), and whether the card deep-links straight into the recommended drill.
