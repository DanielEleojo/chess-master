# Chess Master — Ubiquitous Language

## Training

- **Line** — one repertoire sequence Daniel drills (e.g. "Caro-Kann, Advance"). Belongs to a **System** (Italian / Caro-Kann / Slav).
- **Trap card** — a single-position quiz: find the one punishing move against junk openings he actually faces.
- **Tactics card** — a position to solve, at most two of his moves deep (the opponent answers in between). Two sources, dealt from one deck: a filtered CC0 lichess puzzle tagged to his systems or a beginner motif, and an **own-mistake card** — one of his own flagged moves handed back as the position he got wrong.
- **Why-comment** — the authored one-line principle attached to a drillable move; shown on every hit and miss. Every drillable move must carry one.
- **Miss** — a wrong attempt at a drillable move. Misses teach: they reveal the why, play out the consequence, and requeue the item until clean.
- **Grace first attempt** — a line's first-ever miss is never recorded in stats (teaching is unchanged); first-attempt hits count.

## Games & analysis

- **Unseen game** — a synced game not yet opened in analysis; drives the "N new" badge.
- **Blunder / Mistake** — Daniel's move whose eval swing crosses the blunder/mistake threshold. Carries the position before it, which the tactics deck deals back as an own-mistake card.
- **Book departure** — the ply where a real game left the deepest-matching repertoire line, and who left it (him or the opponent). Feeds miss-driven line extension.

## Coaching

- **Coach** — the entity that reviews and recommends. It owns exactly two surfaces: narrating flagged moves in game analysis, and the **Coach says** card on home. It never plays for Daniel.
- **Explanation** — why a move breaks (or builds) the position. Always two layers: the **fact layer** and the **coach voice**. A bare engine line is not an explanation.
- **Fact layer** — locally computed truths about a flagged move: material hung, tempo lost, king safety, what the best line actually wins. Deterministic, offline, instant.
- **Coach voice** — the LLM phrasing the fact layer as prose. Baseline is rigorous, not encouraging: states the mistake and the fix plainly, no cushioning. Escalates to a blunter register for a genuine **blunder** (never a mere **mistake**) and for a repeat miss on a trap he's already seen — never on the graced first attempt (see **Grace first attempt**). The voice never computes chess and never decides recommendations; it only articulates facts and picks made by code.
- **Coach says** — the home-screen recommendation: what to practice right now and why, chosen by a deterministic priority ladder over Daniel's data, framed against the next milestone.
- **Weakness** — a recurring, evidenced pattern the Coach can act on (a line he keeps leaving early, a blunder cluster, a weak drill stat) — not a one-off mistake.
- **Milestone ladder** — the visible path from Daniel's real rating (extracted from synced games) toward "master": next stop first. Progress is measured, not vibes.
