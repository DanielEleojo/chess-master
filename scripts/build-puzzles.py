#!/usr/bin/env python3
"""Filter the CC0 lichess puzzle DB into data/puzzles.json (ticket 013).

6.1M rows in -> a few hundred out, bucketed into decks the tactics card surface
deals: his three repertoire systems (009), the f7/f2 junk he actually meets
(008's cross-link), and the plain beginner motifs.

    python3 scripts/build-puzzles.py          # downloads the .zst if missing

Every filter is a knob below — rerun after moving one. Deterministic: same DB
dump in, same puzzles.json out.
"""
import csv, io, json, os, subprocess, sys
from datetime import date, timezone, datetime

import zstandard as zstd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "lichess_db_puzzle.csv.zst")
OUT = os.path.join(ROOT, "data", "puzzles.json")
URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"

# --- knobs ---------------------------------------------------------------
BAND = (600, 1300)  # puzzle rating; sub-1200 player, lichess puzzle ratings run high
MIN_POP = 80  # lichess popularity 0-100 — vetted puzzles only
MIN_PLAYS = 200
LENGTHS = {"oneMove", "short"}  # 1-2 moves for him; 'long'/'veryLong' aren't beginner cards
PER_DECK = 30

# key, label, kind, match. First match wins, so the rare/valuable decks come first.
DECKS = [
    ("italian", "Italian Game", "opening", "Italian_Game"),
    ("caro-kann", "Caro-Kann", "opening", "Caro-Kann_Defense"),
    ("slav", "Slav Defense", "opening", "Slav_Defense"),
    ("f7", "The f7 / f2 smash", "theme", "attackingF2F7"),
    ("fork", "Fork", "theme", "fork"),
    ("pin", "Pin", "theme", "pin"),
    ("skewer", "Skewer", "theme", "skewer"),
    ("hanging", "Hanging piece", "theme", "hangingPiece"),
    ("discovered", "Discovered attack", "theme", "discoveredAttack"),
    ("backrank", "Back-rank mate", "theme", "backRankMate"),
    ("mate1", "Mate in 1", "theme", "mateIn1"),
    ("mate2", "Mate in 2", "theme", "mateIn2"),
]
# -------------------------------------------------------------------------


def bucket(tags, themes):
    for key, _, kind, m in DECKS:
        if kind == "opening":
            if any(t == m or t.startswith(m + "_") for t in tags):
                return key
        elif m in themes:
            return key
    return None


def spread(rows, n):
    """n puzzles spanning the deck's whole rating range, easiest first."""
    rows.sort(key=lambda r: r["rating"])
    if len(rows) <= n:
        return rows
    return [rows[round(i * (len(rows) - 1) / (n - 1))] for i in range(n)]


def main():
    if not os.path.exists(SRC):
        print(f"downloading {URL} (~300 MB, gitignored)…", file=sys.stderr)
        subprocess.run(["curl", "-fL", "--retry", "3", "-o", SRC, URL], check=True)

    cand = {k: [] for k, *_ in DECKS}
    scanned = 0
    with open(SRC, "rb") as fh:
        stream = zstd.ZstdDecompressor().stream_reader(fh)
        for row in csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8")):
            scanned += 1
            rating = int(row["Rating"])
            if not BAND[0] <= rating <= BAND[1]:
                continue
            if int(row["Popularity"]) < MIN_POP or int(row["NbPlays"]) < MIN_PLAYS:
                continue
            themes = set(row["Themes"].split())
            if not themes & LENGTHS:
                continue
            key = bucket(row["OpeningTags"].split(), themes)
            if key is None:
                continue
            cand[key].append(
                {
                    "id": row["PuzzleId"],
                    "deck": key,
                    "fen": row["FEN"],
                    "moves": row["Moves"],
                    "rating": rating,
                    "themes": row["Themes"],
                }
            )

    puzzles, decks = [], []
    for key, label, _, _ in DECKS:
        picked = spread(cand[key], PER_DECK)
        puzzles += picked
        decks.append({"key": key, "label": label, "n": len(picked)})
        print(f"{label:<20} {len(picked):3d} of {len(cand[key])} candidates", file=sys.stderr)

    src_date = datetime.fromtimestamp(os.path.getmtime(SRC), timezone.utc).date().isoformat()
    with open(OUT, "w") as fh:
        json.dump(
            {
                "built": date.today().isoformat(),
                "source": f"lichess_db_puzzle.csv.zst dated {src_date} (CC0)",
                "band": list(BAND),
                "decks": decks,
                "puzzles": puzzles,
            },
            fh,
            indent=1,
        )
    print(f"\nscanned {scanned} rows -> {len(puzzles)} puzzles in {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
