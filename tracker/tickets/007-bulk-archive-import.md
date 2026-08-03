---
title: Bulk-import Daniel's chess.com archives
type: task
status: open
assignee:
blocked-by: []
---

## Question

One-time fetch of all of Daniel's monthly chess.com game archives to local storage, so repertoire derivation (ticket 003's blend) and junk-mining have data. Not the instant-sync machinery (ticket 006) — just a script hitting the public monthly-archive endpoints from ticket 001's research.

- HITL step: confirm his exact chess.com username (also wanted by ticket 006 — whichever resolves first records it on the map).
- AFK step: fetch every archive, store PGNs (format per stack ticket 004 if resolved, else plain files).
- Answer records: username, game count, date range, storage location.
