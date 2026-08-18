#!/usr/bin/env node
// Vendor the CC0 lichess/chess-openings TSVs (035) into one position-keyed
// file the app can match games against: epd \t eco \t name per row. EPD (the
// first four FEN fields) is the match key — move orders differ, positions don't.
// Re-run to refresh: node scripts/build-openings.mjs
import { writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const rows = []
for (const f of ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']) {
  const text = await (await fetch(BASE + f)).text()
  for (const line of text.split('\n').slice(1)) {
    const [eco, name, pgn] = line.split('\t')
    if (!pgn) continue
    const c = new Chess()
    try {
      c.loadPgn(pgn)
    } catch {
      console.error('skip unparseable:', eco, name)
      continue
    }
    rows.push(c.fen().split(' ').slice(0, 4).join(' ') + '\t' + eco + '\t' + name)
  }
}
writeFileSync('public/data/openings.tsv', rows.join('\n') + '\n')
console.log(rows.length, 'openings -> public/data/openings.tsv')
