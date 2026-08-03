---
title: How does "instant" game sync work?
type: grilling
status: closed
assignee: baba
blocked-by: [001]
---

## Question

Daniel wants a finished chess.com game to appear in Chess Master the instant it ends. Given ticket 001's findings on API latency and rate limits, decide:

- Polling design: cadence, does it tighten while he's playing (if a live/is-playing signal exists), backoff when idle.
- What "appears in the app" triggers: auto-analysis of the new game? Coach signal update? A visible "new game" surface?
- Honest expectation-setting: what latency is actually achievable vs "instant".

Already settled elsewhere: polling runs **in the browser page** — 004 verified CORS is open and the browser HTTP cache handles ETag revalidation itself, so this ticket designs the fetch-loop cadence and arrival behavior, not where it lives. Username is `babadaniel` (007). New games land in `data/archives/` via the 004 data middleware, same shape the bulk import wrote.

## Resolution

Decided with Daniel 2026-08-03, three branches:

- **Poll signal — tab visibility, nothing else.** Poll the current month's archive every **10s while the Chess Master tab is visible**, **60s while hidden** (`visibilitychange`), and **burst to 5s for ~3 minutes after a new game arrives** (games come in clusters). No `last_online` lookups, no unofficial popup endpoint, no second polling loop — since sync only runs while the page is open, tab state *is* the activity signal. ETag 304 revalidation rides the browser HTTP cache for free (004), and serial polling is officially unlimited (001).
- **On arrival — toast + unseen marker, never interrupt.** New games (diffed by `uuid` against the stored month) are written to `data/archives/YYYY-MM.json` in the bulk-import shape, a non-blocking toast shows result/opponent/time-control until dismissed, and the game is flagged *unseen* in sync state so the future analysis mode can auto-pick it up. No mode switching; a drill in progress is never interrupted.
- **Latency promise — seconds, honestly.** chess.com's 5s server cache is the floor no design can beat; with this cadence a finished game lands typically within **~10–15s while the tab is visible**, up to ~1 min hidden. UI shows only a tiny passive "last synced Xs ago" line — no spinners, no countdowns.

Implementation notes for the build ticket: derive the archive URL from the current UTC month (a fresh month simply starts polling the new URL; old months are already on disk from 007), and the 004 middleware sanitizes names, so it needs to learn the `archives/` prefix (or archives move behind their own name) — 015's problem.

Graduated from fog on resolution: 015 (build the live sync loop), 016 (own-game analysis prototype — was waiting on this design).
