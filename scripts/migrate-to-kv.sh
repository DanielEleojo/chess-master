#!/usr/bin/env bash
# One-time seed: pushes the current data/*.json + repertoire.pgn into the
# Worker's KV namespace under one account, so deploying doesn't start him
# back at zero. That account is keyed by the email you'll log into Cloudflare
# Access with — every key the Worker reads/writes is prefixed "<email>/".
# Usage: scripts/migrate-to-kv.sh <kv-namespace-id> <your-access-login-email>
set -euo pipefail

ID=${1:?usage: migrate-to-kv.sh <kv-namespace-id> <access-login-email>}
EMAIL=${2:?usage: migrate-to-kv.sh <kv-namespace-id> <access-login-email>}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

put() { npx wrangler kv key put --remote --namespace-id "$ID" "$EMAIL/$1" --path "$2"; }

for f in data/*.json; do
  name=$(basename "$f" .json)
  [ "$name" = selftest ] && continue
  put "$name" "$f"
done

for f in data/archives/*.json; do
  month=$(basename "$f" .json)
  put "archives/$month" "$f"
done

put "repertoire.pgn" "data/repertoire.pgn"

# skip the first-login prompt: this data is babadaniel's chess.com games
npx wrangler kv key put --remote --namespace-id "$ID" "$EMAIL/settings" '{"chessUsername":"babadaniel"}'

echo "done — $(npx wrangler kv key list --remote --namespace-id "$ID" | grep -c '"name"') keys in KV"
