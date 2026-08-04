---
title: Give the app a visual identity — the scoresheet
type: task
status: closed
assignee: claude
blocked-by: [014]
---

## Question

014 closed with a design pass that made every mode *consistent*. It left them
consistently generic: near-black ground, one gold accent, a 2×2 grid of rounded
cards. That is the default dark theme — nothing on screen said chess, and it
would have suited a habit tracker or a crypto dashboard equally well.

Give the app a direction with a thesis of its own, derived from the subject
rather than picked off a palette shelf, and carry it through every surface.
Constraint: it runs offline off one machine, so no webfonts, no new deps.

## Resolution

The direction is **Daniel's tournament scoresheet**, and it starts from the one
object he actually stares at.

- **The board is the thesis.** `cg-board` is a real roll-up tournament board
  now — buff light squares (`#e9ddc3`), vinyl green dark ones (`#4d7364`) — done
  by overriding brown.css's 20%-black checker overlay with a
  `repeating-conic-gradient`. Verified a1 dark / a8 light. The whole palette is
  taken off that board: `--bg` is the dark square pushed down to page ground,
  `--ink` is the light square, `--red` is the clock's red flag.
- **Brass means earned, red means wrong.** Gold was decorating everything, so it
  meant nothing. It's now reserved for what he earned — streaks, cleared rungs,
  analysed games, the rating. Red is the annotator's pen: misses, blunders, his
  own flagged positions, and the `?` that marks the coach's note on home (no
  pill, no gradient). Pending counts ("12 new") sit in plain ink.
- **Home leads with the ladder.** `MILESTONES` was rendered as 11px of grey
  inside the coach card; it's now the page header, drawn to scale — all 13 rungs
  from his next stop to master, marker where the rating actually lands, brass
  for ground covered. It is the app's own domain model shown as what it is. The
  product name demotes to a tracked-caps eyebrow: it's his tool, he knows what
  it is.
- **Modes become ruled ledger rows** under the coach's pick. A scoresheet is
  rows; this also sets the honest hierarchy — the coach's pick is the hero, the
  modes are the index.
- **One shell for every board mode** (`.play`): board left, feedback in the rail
  beside it. Feedback used to sit *under* the board, ~500px from where the eye
  lands after a move. Traps and Tactics stop squeezing a 400px board into a
  narrow centred card with a dead void beneath it.
- **The game list is a crosstable** — date, colour, opponent, time class, and
  the score as `1` / `0` / `½` (`gameParts()` in `sync.ts`) instead of "You won
  vs X · bullet" repeated 500 times. 500 games are scannable now.
- **Severity rides the glyph, not the colour.** `?` and `??` are how an
  annotator writes mistake and blunder, so the movelist lets them carry it and
  colour only says "flagged" — which frees brass from having to mean "mistake".
- **Removed** (the pass's one-accessory-off): the radial background glow, the
  card drop shadows, the 12px corner radius, and the `ui-serif` h1. A scoresheet
  is flat and ruled. Every number is now tabular mono.

**Five bugs surfaced, none of them cosmetic:**

1. `Board` was hard-sized in pixels, so *every* mode scrolled horizontally on
   mobile and misplaced pieces on any window resize. Now fluid with `size` as a
   ceiling, plus a `ResizeObserver` driving `redrawAll()` — chessground places
   pieces from cached pixel bounds.
2. The old brown palette was still hardcoded in the global `button:hover`,
   `button.primary:hover`, `.coach`, `.rung.on` and the board highlights — all
   of it would have rendered wrong-coloured in every mode.
3. `.feedback` collided with the global `.bad` text utility, tinting the whole
   box red so the why-comment read as error text rather than the lesson.
4. The coach note rendered as a bare `?` with nothing beside it whenever Ollama
   was down; it now falls back to the pick's own evidence at prose weight, so
   the mark is never left alone.
5. `CoachCard` refetched every archive month on each `history`/`unseen` change.
   `App` reads the ratings once at boot and shares them with the card.

**Verified**: `tsc` clean, selftest 117/117, every mode driven in the browser
(including a headless miss → "why not my move?" → coach voice in the drill, and
a live engine reply in sparring), no console errors, no horizontal overflow at
375px. `data/analysis.json` moved as a side effect of clicking through games to
check the layout — two records upgraded from `ANALYSIS_V` 2 to 4, one new game
analysed.

Deliberately not done: the modes' *content* is unchanged — this pass moved and
retinted, it did not add features or copy beyond row descriptions.
