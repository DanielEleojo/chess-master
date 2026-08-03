#!/usr/bin/env bash
# One-time bulk import of all monthly chess.com archives (ticket 007).
# Usage: scripts/import-archives.sh <username> [outdir]
set -euo pipefail

user=${1:?usage: import-archives.sh <username> [outdir]}
outdir=${2:-data/archives}
ua="User-Agent: Chess Master training app (danielbaba029@gmail.com)"

mkdir -p "$outdir"
# ponytail: serial curl, no retries — official guidance says serial is unlimited
archives=$(curl -sf -H "$ua" "https://api.chess.com/pub/player/$user/games/archives" | jq -r '.archives[]')
[ -n "$archives" ] || { echo "no archives for $user" >&2; exit 1; }

for url in $archives; do
  ym=$(echo "$url" | awk -F/ '{print $(NF-1)"-"$NF}')   # YYYY-MM
  curl -sf -H "$ua" "$url" -o "$outdir/$ym.json"        # JSON per month: PGN + clocks/eco/uuid per game
  echo "$ym: $(jq '.games | length' "$outdir/$ym.json") games"
done

total=$(jq -s '[.[].games | length] | add' "$outdir"/*.json)
echo "total: $total games in $outdir ($(ls "$outdir" | head -1) .. $(ls "$outdir" | tail -1))"
