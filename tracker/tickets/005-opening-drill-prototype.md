---
title: Opening-trainer drill flow — what does a practice session feel like?
type: prototype
status: closed
assignee: claude
blocked-by: [003]
---

## Question

What should a 10-minute opening practice session feel like? Build a cheap clickable prototype (via /prototype) for Daniel to react to:

- Board quiz: position appears, he plays the repertoire move; right/wrong feedback.
- What happens on a wrong move — show the answer, retry, explain why?
- Scheduling: spaced repetition per line, or simple streak/last-missed ordering?
- Session shape: fixed number of lines, or drill-until-tired?

Link the prototype as an asset on this ticket; the reaction, not the code, is the deliverable.

## Asset

`prototypes/drill-flow.html` — three structurally different drill flows on one page, drilling the real 22 lines from `data/repertoire.pgn` (chessground + chess.js via CDN, needs internet). Run `python -m http.server 8730` in the repo root and open <http://localhost:8730/prototypes/drill-flow.html>, or just open the file in a browser. Switch variants with the bottom bar, `←`/`→`, or `?variant=A|B|C`; `?selftest=1` runs the logic checks (verified all green 2026-08-03, plus each variant driven end-to-end in a browser).

Each variant is one answer-bundle to this ticket's four questions:

| | A — Card sprint | B — Streak run | C — Coach |
|---|---|---|---|
| Quiz unit | one position, one move | whole lines, back to back | whole line, watch then prove |
| Wrong move | reveal arrow, then you must play it | 2 blind retries, then reveal + streak reset | explain why (PGN comment / piece hint), retry; arrow on 2nd miss |
| Scheduling | "due" cards first (spaced-rep flavor) | missed lines requeue 2 slots later | 3 weakest lines by mastery |
| Session shape | fixed 10 cards + summary | endless until "End session" | fixed 3 lines + mastery gains |

Awaiting Daniel's reaction — which flow (or which parts of which) is the one to build. Frankenstein answers welcome ("A's cards with C's explanations").

## Resolution

Daniel played all three variants 2026-08-03. Decisions:

- **A as built is rejected** — bare recite-the-line cards are "too surface level." The fast-card *format* survives, refilled with **positions he'd actually meet in his games**: day one, trap refutations and junk-punishment spots from `data/traps.pgn` (the 2.Bc4/2.Qh5 crowd he faces constantly); later, spots where he left book or blundered in real games (needs the analysis mode) and lichess puzzles filtered to his systems.
- **B and C both landed → one blended line-drill mode**: B's shape (endless streak pacing, misses requeue a couple of slots later, end-whenever summary) with C's feedback on a miss (explain why — PGN comment or piece hint — then retry; reveal arrow only on the second miss) replacing B's bare retry/reveal.
- No time-based spaced repetition in v1 — A's "due dates" died with A; ordering is driven by misses, consistent with 003's miss-driven philosophy.
- Open build detail (not decided here): whether a never-before-drilled line gets C's watch-first intro pass before being quizzed.

Net: the v1 opening trainer is **two surfaces sharing one drill engine** — the blended line drill and real-game puzzle cards. Asset kept: `prototypes/drill-flow.html` (all three variants preserved for reference).
