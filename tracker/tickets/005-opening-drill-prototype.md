---
title: Opening-trainer drill flow — what does a practice session feel like?
type: prototype
status: open
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
