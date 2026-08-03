---
title: Engine sparring — a beatable Stockfish for a sub-1200
type: prototype
status: open
assignee:
blocked-by: [011]
---

## Question

Wire the installed-but-unwired `stockfish` dep into a sparring mode and calibrate it until it feels beatable-but-honest for rapid-335 Daniel: stockfish.js lite in a Web Worker, weakened per 002 — Skill Level 0–5 plus node caps plus MultiPV softmax pick (not `UCI_Elo`: real floor 1320 and it plays weirdly there). Prototype-first like 005: a playable rough take, Daniel spars, his reaction picks the presets.

Open while prototyping:

- strength presets — how many rungs, named how, and what actually varies per rung;
- time controls, or none (casual move-when-ready);
- where a spar starts — fresh game, or from a repertoire line he's drilling (ties sparring back to the opening trainer).
