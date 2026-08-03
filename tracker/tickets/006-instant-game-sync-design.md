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
- His exact chess.com username, and honest expectation-setting: what latency is actually achievable vs "instant".
