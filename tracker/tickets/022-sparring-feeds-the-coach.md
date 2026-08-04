---
title: Sparring results feed the coach
type: task
status: closed
assignee: claude
blocked-by: [014, 018]
---

## Question

The map's last open thread: sparring (014) wrote its rung to `localStorage` and
stopped there. Every other mode reaches the coach — drill history, sync-state,
analysis — but a spar game produced no evidence at all, so `recommend.ts` could
not see the one opponent Daniel actually plays inside the app.

Three ways to close it were on the table: leave it (the rung ladder is its own
signal), give sparring a rung of its own, or make a finished spar game evidence
the existing rungs already know how to read. Daniel picked the third.

## Resolution

**A finished spar game is recorded as one of his games, and nothing else was
built.** No new rung, no new recommender branch, no second analysis UI.

- `sparGame()` (in `analyze.ts`) turns the finished `Chess` into the same
  chess.com-shaped `FullGame` the rest of the app already consumes: his username
  on his side, the rung name as the opponent, chess.com's own result vocabulary
  (`win` / `checkmated` / `resigned` / `stalemate` / `insufficient` /
  `repetition` / `50move`), `time_class: 'sparring'`, `rated: false`.
- `saveSparGame()` appends it to `data/spar-games.json` and adds its uuid to
  `sync-state.unseen`, so the coach's top rung nags him to review it exactly
  like a real arrival — and `markSeen` clears it on open, unchanged.
- Analysis mode concatenates the file into its list. It needed one line: the
  crosstable, the engine walk, the flagged-move list, the coach note and the
  board all work on it as-is.
- From there the chain is the one that already existed: flagged moves land in
  `analysis.json`, so the blunder-cluster rung counts them and the tactics deck
  deals them back as own-mistake cards.

**One deliberate exception**: `analyzeGame` skips `bookWalk` for
`time_class === 'sparring'`. Sparring can start *from* a repertoire line, which
the app replays itself — counting it would invent left-book and extension
evidence (019/020) that Daniel never produced. `rated: false` keeps it out of
the milestone ladder for the same reason: the rating on home stays his real one.

**Verified**: `tsc` clean, selftest 123/123 (6 new — the result/colour mapping
across mate, resignation and stalemate, plus the pgn round-trip). Driven live:
sparred a game against Careless via the `cmMove` dev hook, resigned, and watched
it write `data/spar-games.json` + the unseen uuid; it appeared top of the
analysis crosstable as `0 · ○ Careless · sparring`, walked clean (`Bc4?`,
`Qh5??`, `Qxf7+??`, `book: null`), cleared its unseen flag, and home's Tactics
row went from 20 to 23 of his own positions. No console errors.

Skipped: a spar-specific rung ("stuck on rung 3 — four losses"). The wins ladder
already shows that, and a rung earns its place on evidence Daniel asks about.
