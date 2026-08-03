---
title: Build the live sync loop
type: task
status: closed
assignee: baba
blocked-by: [011]
---

## Question

Implement 006's sync design in the 011 shell. Done when finishing a game on chess.com makes a toast appear in a visible Chess Master tab within ~15s and the game is on disk.

Checklist:

- Fetch loop against `api.chess.com/pub/player/babadaniel/games/{YYYY}/{MM}` (current UTC month): 10s visible / 60s hidden (`visibilitychange`) / 5s burst for ~3 min after an arrival. Plain `fetch` — the browser cache does ETag 304s (004).
- Diff by game `uuid` against the stored month file; write new games to `data/archives/YYYY-MM.json` in the bulk-import shape. The 004 middleware sanitizes names — teach it the `archives/` prefix or give archives their own route.
- Arrival: non-blocking toast (result, opponent, time control) until dismissed; flag the game unseen in sync state (e.g. `data/sync-state.json`) for the future analysis mode; never interrupt a running drill.
- Tiny passive "last synced Xs ago" text somewhere unobtrusive. No spinners.

## Resolution

**Built and verified live — a real bullet game (win vs CHECKERTOBII) arrived mid-session: toast in the visible tab and game on disk within one ~10s poll.**

- [src/lib/sync.ts](../../src/lib/sync.ts): pure helpers (`monthKey`, `newGames` uuid-diff, `describeGame` → "You won vs Opp · rapid") plus `startSync()` — a setTimeout chain polling `api.chess.com/pub/player/babadaniel/games/{YYYY}/{MM}` at 10s visible / 60s hidden / 5s burst for 3 min after an arrival; `visibilitychange` back to visible syncs immediately. Plain `fetch`; the browser HTTP cache does the ETag 304s as designed in 004/006.
- New games merge into `data/archives/YYYY-MM.json` in the bulk-import shape; the 004 middleware regex learned an optional `archives/` prefix (one-line change, no new route).
- Arrivals: uuids appended (Set-deduped) to `unseen` in `data/sync-state.json` for the future analysis mode (016); non-blocking corner toasts (result, opponent, time class) rendered over every mode, persisting until clicked; a backlog >3 games collapses to one "N new games synced" toast.
- Home screen shows a tiny "last synced Xs ago" line; no spinners, nothing during drills.
- One real bug found in verification: dev double-mount left an in-flight tick that persisted an arrival twice — fixed with a stopped-check before side effects + the Set dedupe.
- Selftest: six new assertions (diff, three toast texts, month key, `archives/` route round-trip) — all green alongside the existing suite.
