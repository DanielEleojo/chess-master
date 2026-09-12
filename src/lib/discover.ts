// Opening discovery: which real openings he actually reaches that his
// repertoire has no answer for, ranked by how often and how badly it goes.
// Reuses the same book-walk (analyze.ts) and vendored theory (openings.ts)
// the game review already computes — no engine scan needed to answer
// "what should I learn next," just his synced games and chess.js.
import { Chess } from 'chess.js'
import { bookWalk, type FullGame } from './analyze'
import { bookRun, type Openings } from './openings'
import type { Line } from './pgn'
import { gameParts } from './sync'

export interface OpeningGap {
  name: string
  color: 'w' | 'b'
  games: number
  wins: number
  losses: number
  draws: number
  score: number // games weighted by how often it isn't a win — ranks the list
  sample: string[] // SAN prefix of the deepest theory match seen — what the board demos
}

// "A10 English Opening: Anglo-Indian Defense" -> "English Opening"
const baseName = (full: string) => full.replace(/^[A-E]\d\d\s*/, '').split(':')[0].trim()

export function openingGaps(
  games: FullGame[],
  user: string,
  lines: Line[],
  openings: Openings,
  minGames = 2,
): OpeningGap[] {
  const by: Record<string, OpeningGap> = {}
  for (const g of games) {
    if (g.rules !== 'chess') continue
    let sans: string[], afters: string[]
    try {
      const c = new Chess()
      c.loadPgn(g.pgn)
      const moves = c.history({ verbose: true })
      if (!moves.length) continue
      sans = moves.map((m) => m.san)
      afters = moves.map((m) => m.after)
    } catch {
      continue
    }
    const color: 'w' | 'b' = g.white.username.toLowerCase() === user ? 'w' : 'b'
    if (bookWalk(sans, color, lines)) continue // repertoire already answers this
    const { plies, name } = bookRun(afters, openings)
    if (!name) continue
    const key = `${color}:${baseName(name)}`
    const gap = (by[key] ??= {
      name: baseName(name),
      color,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      score: 0,
      sample: [],
    })
    gap.games++
    // the deepest theory match seen for this opening is the most instructive demo
    if (plies > gap.sample.length) gap.sample = sans.slice(0, plies)
    const cls = gameParts(g, user).cls
    if (cls === 'win') gap.wins++
    else if (cls === 'loss') gap.losses++
    else gap.draws++
  }
  const list = Object.values(by).filter((g) => g.games >= minGames)
  for (const g of list) g.score = g.games * (1 - g.wins / g.games)
  return list.sort((a, b) => b.score - a.score)
}
