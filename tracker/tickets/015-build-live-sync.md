---
title: Build the live sync loop
type: task
status: open
assignee:
blocked-by: [011]
---

## Question

Implement 006's sync design in the 011 shell. Done when finishing a game on chess.com makes a toast appear in a visible Chess Master tab within ~15s and the game is on disk.

Checklist:

- Fetch loop against `api.chess.com/pub/player/babadaniel/games/{YYYY}/{MM}` (current UTC month): 10s visible / 60s hidden (`visibilitychange`) / 5s burst for ~3 min after an arrival. Plain `fetch` — the browser cache does ETag 304s (004).
- Diff by game `uuid` against the stored month file; write new games to `data/archives/YYYY-MM.json` in the bulk-import shape. The 004 middleware sanitizes names — teach it the `archives/` prefix or give archives their own route.
- Arrival: non-blocking toast (result, opponent, time control) until dismissed; flag the game unseen in sync state (e.g. `data/sync-state.json`) for the future analysis mode; never interrupt a running drill.
- Tiny passive "last synced Xs ago" text somewhere unobtrusive. No spinners.
