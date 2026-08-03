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

## Progress (2026-08-03)

**Blocked on username.** Daniel supplied `danielbaba029`, but the chess.com API returns 404 for it (checked live, along with variants `danielbaba29`/`danielbaba0` — also 404). The near-match `danielbaba` exists but is a dormant Brazilian account (joined Sept 2023, last online Oct 2023, 9 games) — almost certainly not him, so nothing was imported.

The AFK half is done and tested: `scripts/import-archives.sh <username>` serially fetches every monthly archive as JSON (each game carries PGN + clocks/eco/uuid) into `data/archives/YYYY-MM.json` and prints game counts. Verified end-to-end against the real `danielbaba` account. Once the correct username is confirmed, resolving this ticket is one command.
