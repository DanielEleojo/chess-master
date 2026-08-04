---
title: Build the Learn mode + wire per-move detail into Line Drill
type: task
status: closed
assignee: claude
blocked-by: [031]
---

## Question

Ship 030's decision using 031's `data/learn.json`:

- A new Home tile, **Learn**, alongside Drill/Tactics/Spar/Analysis — opens
  to a picker across the three systems, each opening its overview (plans /
  pawn breaks / key squares). Text-only, no board — a reading surface, not
  a `.play` shell. Follows the scoresheet visual identity (021).
- Inside Line Drill, load the same `data/learn.json` and render its
  per-move text alongside the existing why-comment, always expanded, for
  every move that has an entry.

## Resolution (2026-08-04)

Shipped. `src/lib/learn.ts` holds the `LearnData` type and `moveKey(ply, san)`
— the move-number-qualified SAN key (`"2.Nf3"`, `"3...Bf5"`) 031 authored
`learn.json` against, shared by both surfaces.

**Learn mode** (`src/modes/Learn.tsx`): a new Home tile opens a system
picker (Italian / Caro-Kann / Slav) → each opens its brief (Plans / Pawn
breaks / Key squares) as plain `.panel` blocks, no board, no new CSS beyond
a thin `.learnbriefs`/`.learnnote` addition — reuses the scoresheet's
existing panel and ledger chrome. Back steps up one level (brief → picker →
home) rather than exiting straight to Home.

**Line Drill**: the expected move's learn text is looked up the moment a
move is attempted (`ply` captured before `tryMove` mutates it, since a hit
advances the drill's ply and a miss doesn't) and shown in an always-visible
`.learnnote` block beside the existing `.coach` line — on a hit, a miss
hint, and a miss reveal alike, no click required. Verified live: dealt a
Caro-Kann line, the longer text appeared alongside `✓ c6 — prepare ...d5…`
on a correct move and again alongside the miss reveal for `d5`.

**Data location fix**: moved `data/learn.json` → `public/data/learn.json`
mid-build — it's static and account-independent like `traps.pgn`/
`puzzles.json` (dev serves it from `public/data/`, production's Worker
bundles it into `dist/` via `env.ASSETS`), unlike `repertoire.pgn` which is
per-account and KV-served. 031's `scripts/validate-learn.mjs` updated to
read the new path; still passes clean. `Selftest.tsx` gained a live check
(`moveKey` unit cases, all three briefs non-empty, every commented
repertoire move has a matching `learn.json` entry) so a future edit to
either file that breaks the pairing fails loudly, mirroring what
`validate-learn.mjs` checks at author time.

`?selftest=1` itself renders blank in this browser — that's the
pre-existing, already-tracked crash (028), unrelated to this change;
verified the actual feature through normal navigation instead.
