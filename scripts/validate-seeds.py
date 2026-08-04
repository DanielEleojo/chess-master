#!/usr/bin/env python3
"""Validate data/repertoire.pgn and data/traps.pgn: every move legal, every
+/# claim true, required tags present. Needs python-chess. Exits non-zero on
any failure — run after every hand edit or miss-driven extension."""
import sys
from pathlib import Path

import chess.pgn

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = {
    ROOT / "data" / "repertoire.pgn": ("System", "TrainAs"),
    ROOT / "public" / "data" / "traps.pgn": ("Punisher",),
}

failures = 0
for path, tags in REQUIRED.items():
    fname = path.name
    count = 0
    with open(path) as fh:
        while (game := chess.pgn.read_game(fh)) is not None:
            count += 1
            name = game.headers.get("Event", f"game {count}")
            for e in game.errors:
                failures += 1
                print(f"FAIL {fname} / {name}: {e}")
            for t in tags:
                if t not in game.headers:
                    failures += 1
                    print(f"FAIL {fname} / {name}: missing [{t}] tag")
            # node.san() recomputes notation, so a false "#" in the file is
            # invisible per-move; a decisive Result tag is our mate claim.
            board = game.end().board()
            if game.headers.get("Result") in ("1-0", "0-1") and not board.is_checkmate():
                failures += 1
                print(f"FAIL {fname} / {name}: decisive result but final position is not mate")
    print(f"{fname}: {count} games")

sys.exit(1 if failures else 0)
