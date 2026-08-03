# 003 — Off-the-Shelf Data: Beginner Repertoire & Classic Traps

Researched 2026-08-03 against primary sources (lichess.org API spec/ToS/database pages, lichess-org GitHub repos and raw data files, GitHub repo search, live study exports).

## TL;DR

- **No ready-made openly-licensed dataset exists for either half.** Verified across GitHub search, database.lichess.org (dumps = games/puzzles/evals/openings only — no studies), the puzzle theme list, and the chess-openings TSVs.
- **Repertoire:** the lichess **study export API** is the practical source — public studies export as clean annotated PGN with **no auth** (`GET /api/study/{id}.pgn`). Catch: study content is the author's copyright (lichess ToS grants lichess a license, not the public) — fine for personal/local use, not for redistribution.
- **Traps:** same story. Good exactly-on-brief studies exist and export cleanly (verified `OyqewZTH` — Scholar's Mate/Wayward Queen/Fried Liver counters with refutation moves and `[%cal]` arrows). But the **laziest clean fallback is a hand-written `traps.pgn` of ~12–20 traps + refutations** (~an afternoon; move sequences are facts, not copyrightable), auto-named via the CC0 chess-openings TSV and cross-linked to CC0 puzzles via `OpeningTags`.
- The chess-openings TSV is **confirmed a naming dictionary only**: lines truncate where the name is established (e.g. Fried Liver stops at `6.Nxf7`, Englund Main Line stops before the `…Qc1#` trick). Skeleton/index, not a repertoire or traps source.

---

## 1. Repertoire sources

### Lichess study export API — the mechanism works, licensing is the catch

Endpoints (verified in the OpenAPI spec, [raw lichess-api.yaml](https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/lichess-api.yaml); docs: [lichess.org/api#tag/Studies](https://lichess.org/api#tag/Studies)):

- `GET /api/study/{studyId}.pgn` — all chapters of a study
- `GET /api/study/{studyId}/{chapterId}.pgn` — one chapter
- `GET /api/study/by/{username}/export.pgn` — all of a user's studies
- Query params `comments`, `variations` (default true — sidelines included), `orientation`, `clocks`

**No auth needed for public studies** — spec verbatim: "If not [authenticated], only public (non-unlisted) study chapters are read." Verified empirically: `curl https://lichess.org/api/study/OyqewZTH.pgn` returns full annotated PGN, no token.

**License:** lichess [Terms of Service](https://lichess.org/terms-of-service): "You retain your rights in any content you submit" — users grant *lichess* a sublicensable license, not third parties. No CC0/CC-BY on studies, and [database.lichess.org](https://database.lichess.org/) offers no studies dump. Prose annotations are the author's copyright; bare move sequences are facts. **For this personal/local app: non-issue. For redistribution: not cleared.**

### lichess.org/practice — dead end for repertoires

Backed by hardcoded study IDs in [lila `PracticeSections.scala`](https://github.com/lichess-org/lila/blob/master/modules/practice/src/main/PracticeSections.scala) (lila is AGPL-3; the study content lives on lichess servers). Sections: Checkmates, Fundamental Tactics, Advanced Tactics, Pawn/Rook Endgames — **no openings/repertoire section at all**. (Useful later as official-lichess-authored tactics lesson content, exportable via the same API.)

### GitHub — generators exist, curated datasets don't

Repo search returns tools, not data: [zcesur/opening-repertoire](https://github.com/zcesur/opening-repertoire) (BSD-3, *generates* repertoires from PGN collections), [raccrompton/BookBuilder](https://github.com/raccrompton/BookBuilder) and [joshwalters/CROM](https://github.com/joshwalters/CROM) (build repertoires from lichess explorer stats / dumps). No repo ships a curated openly-licensed "beginner-repertoire.pgn". Note: a repertoire *generated* from CC0 lichess explorer data is license-clean, medium effort. Wikibooks [Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory) (CC BY-SA) is a theory tree, not a repertoire; scraping effort high — noted, not recommended.

### chess-openings TSV as repertoire? Confirmed: no

Pulled the raw TSVs ([lichess/chess-openings](https://github.com/lichess-org/chess-openings), CC0). Lines are name-defining prefixes with no recommendations, annotations, or continuations — e.g. `C57 … Fried Liver Attack` ends at `6.Nxf7`; `A40 Englund Gambit: Main Line` ends at `3...Qe7`, before the famous `…Qc1#` trick. Usable as a **skeleton/index** (~30 beginner-relevant named lines as spine positions), with the actual repertoire moves written by hand.

**Recommendation (repertoire):** hand-write a tiny PGN repertoire — ~2 white + 2 black systems, a few dozen lines is genuinely enough for sub-1200 — optionally seeded in structure from an exported public study kept local. Ingestion effort near zero (chess.js parses it; ticket 002 stack unchanged).

## 2. Traps with refutations

### Plain answer

**No ready-made openly-licensed traps-with-refutations dataset exists.**

Dead ends, verified:

- **GitHub** ("chess traps"): [ebenz99/ChessBrain](https://github.com/ebenz99/ChessBrain) (React app, no license), [tourtiere/opening-traps](https://github.com/tourtiere/opening-traps) (app, no license), [davidADSP/chess-trap-scorer](https://github.com/davidADSP/chess-trap-scorer) (scores trappiness via lichess API, ships no corpus).
- **Puzzle DB themes**: fetched [puzzleTheme.xml](https://github.com/lichess-org/lila/blob/master/translation/source/puzzleTheme.xml) — **no "trap" theme**. Closest: `opening` and `attackingF2F7` ("…such as in the fried liver opening"). So the CC0 puzzle DB *approximates* trap-punishment drills via `Themes ~ (opening|attackingF2F7)` + `OpeningTags ~ (Englund_Gambit|Italian_Game_Two_Knights_Defense|…)` — real punish-the-blunder positions, but they start mid-position and don't teach the trap's move-order story.
- **chess-openings TSV**: contains ~15 lines literally named "Trap" (Siberian, Marshall, Mortimer, Noah's Ark, Lasker, Légal-adjacent lines, Wayward Queen, Anti-Fried-Liver `3...h6`, Englund, Traxler, Danish…) but truncated at the naming point — **no refutation continuations**. Trap *index/namer* only.
- **database.lichess.org**: games/puzzles/evals/openings dumps only.

### What does exist: lichess trap studies (exportable, author-copyrighted)

Topic page [Traps in openings](https://lichess.org/study/topic/Traps%20in%20openings/popular): e.g. "Trap and Tactics for Beginner" (`bZPGDlhB`, ~1.7k likes, 18 chapters — verified export), "ultimate opening traps" (`lmXEKzxC`), "10 Traps in the Queen's Gambit" (`nEGI6dm9`). Exactly on brief: **"Counter to Scholar's Mate, Fried Liver and More" (`OyqewZTH`)** — verified export: chapters like "Scholar's Mate" with defensive lines (`1.e4 e5 2.Qh5 d6 3.Bc4 g6 4.Qf3 Nf6 …`), `[%cal]` arrows, `[Opening "…Wayward Queen Attack"]` headers — directly machine-ingestable PGN. Same license caveat as §1. (Caveat from verification: topic-page chapter counts can be wrong — always check the actual PGN.)

### Laziest viable path (recommendation)

Hand-write **one `traps.pgn` of ~12–20 traps with refutations** (~an afternoon, forever your-own/CC0):

1. Every trap on the brief is textbook and the moves are uncopyrightable facts: Scholar's Mate + `2...Nc6/3...g6` defense; Wayward Queen `2...Nc6 3.Bc4 g6 4.Qf3 Nf6`; Fried Liver + Anti-Fried-Liver `3...h6` and `4...d5!` vs `4.Ng5`; Traxler attempts; Englund `…Qb4+/Qxb2/…Qc1#` and refutation `4.Bf4 Qb4+ 5.Bd2 Qxb2 6.Nc3!`; Blackburne-Shilling `3...Nd4?! 4.Nxe5? Qg5!` and refutation `4.Nxd4`; Légal's mate (punish `…Bxd1?`, calm `…dxe5` instead); Danish/King's Gambit junk with `…d5!` equalizers.
2. Auto-name/ECO-tag each line against the chess-openings TSV already vendored (the trap names are in it).
3. Optionally skim (not copy prose from) `OyqewZTH`/`bZPGDlhB` exports for structure, and cross-link each trap to live drills by filtering the CC0 puzzle DB on `OpeningTags` + `attackingF2F7`/`opening` themes.

Effort: one ~200-line PGN file plus a puzzle-DB filter over data already chosen in ticket 002. That's the whole traps feature.

## Key URLs

- Study API: https://lichess.org/api#tag/Studies · spec: https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/lichess-api.yaml
- ToS (study content ownership): https://lichess.org/terms-of-service
- CC0 dumps (no studies): https://database.lichess.org/
- Practice config: https://github.com/lichess-org/lila/blob/master/modules/practice/src/main/PracticeSections.scala
- Puzzle themes: https://github.com/lichess-org/lila/blob/master/translation/source/puzzleTheme.xml
- Openings TSVs: https://github.com/lichess-org/chess-openings
- Traps studies: https://lichess.org/study/topic/Traps%20in%20openings/popular · verified: https://lichess.org/study/OyqewZTH · https://lichess.org/study/bZPGDlhB
- Dead ends: https://github.com/ebenz99/ChessBrain · https://github.com/tourtiere/opening-traps · https://github.com/davidADSP/chess-trap-scorer · generators only: https://github.com/zcesur/opening-repertoire · https://github.com/raccrompton/BookBuilder · https://github.com/joshwalters/CROM
