---
title: How does "instant" game sync work?
type: grilling
status: open
assignee:
blocked-by: [001]
---

## Question

Daniel wants a finished chess.com game to appear in Chess Master the instant it ends. Given ticket 001's findings on API latency and rate limits, decide:

- Polling design: cadence, does it tighten while he's playing (if a live/is-playing signal exists), backoff when idle.
- What "appears in the app" triggers: auto-analysis of the new game? Coach signal update? A visible "new game" surface?
- Honest expectation-setting: what latency is actually achievable vs "instant".

Already settled elsewhere: polling runs **in the browser page** — 004 verified CORS is open and the browser HTTP cache handles ETag revalidation itself, so this ticket designs the fetch-loop cadence and arrival behavior, not where it lives. Username is `babadaniel` (007). New games land in `data/archives/` via the 004 data middleware, same shape the bulk import wrote.
