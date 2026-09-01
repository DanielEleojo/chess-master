#!/usr/bin/env tsx
// The app's checks, in the terminal (and in CI). Same runChecks() the Selftest
// mode calls — the only difference is where the seed data comes from: this
// reads the files off disk, the browser fetches them over HTTP.
//
//     npm test
//
// The six checks that need a running server or the Stockfish worker are not
// here by design — they live in modes/Selftest.tsx as liveChecks(), reachable
// at ?selftest=1 while `npm run dev` is up.
import { readFileSync } from 'node:fs'
import { runChecks } from '../src/lib/selftest'
import { parseGames } from '../src/lib/pgn'
import { lichessCards, emptyPuzzles, type PuzzleFile } from '../src/lib/puzzles'
import type { LearnData } from '../src/lib/learn'

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const json = <T,>(p: string): T => JSON.parse(read(p)) as T

const results = runChecks({
  lines: parseGames(read('data/repertoire.pgn')),
  traps: parseGames(read('public/data/traps.pgn')),
  tactics: lichessCards({ ...emptyPuzzles(), ...json<PuzzleFile>('public/data/puzzles.json') }),
  learn: json<LearnData>('public/data/learn.json'),
})

for (const c of results) console.log((c.pass ? 'PASS' : 'FAIL') + '  ' + c.name)

const failed = results.filter((c) => !c.pass).length
console.log(`\n${results.length} checks, ${failed} failing`)
process.exit(failed ? 1 : 0)
