---
title: Bulk-import Daniel's chess.com archives
type: task
status: closed
assignee: babadaniel
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

## Resolution (2026-08-03)

- **Username: `babadaniel`** (displays as BabaDaniel). Verified against his profile: active, joined Feb 2023, sub-1200 in every live time class (rapid 335, blitz 125, bullet 132).
- **499 games** imported: 236 rapid, 136 bullet, 121 blitz, 6 daily. Mostly recent — 389 of them from July 2026.
- **Date range**: Feb 2023 – Aug 2026, sparse (9 non-empty months).
- **Storage**: `data/archives/YYYY-MM.json`, one file per month, chess.com's monthly-archive JSON verbatim — each game carries full PGN plus clocks, ECO, uuid, time_class. Re-runnable anytime via `scripts/import-archives.sh babadaniel`.
