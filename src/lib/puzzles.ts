// Tactics deck (ticket 013) — two sources, one card shape.
//
//   data/puzzles.json   filtered CC0 lichess puzzles (scripts/build-puzzles.py)
//   data/analysis.json  his own flagged moves (016) — the position dealt back
//
// Both become fen-rooted Lines so the shared drill engine (005/011) walks them:
// a puzzle's first ply is the opponent's move into the shot, a blunder card
// starts on his turn in the position he actually got wrong.
import { Chess } from 'chess.js'
import type { Line } from './pgn'
import { computeFacts } from './facts'
import type { Analysis, Blunder } from './analyze'
import { byWeakness, type History } from './history'

export interface Puzzle {
  id: string
  deck: string
  fen: string
  moves: string // space-joined uci
  rating: number
  themes: string // space-joined
}

export interface PuzzleFile {
  built: string
  source: string
  band: [number, number]
  decks: { key: string; label: string; n: number }[]
  puzzles: Puzzle[]
}

export const emptyPuzzles = (): PuzzleFile => ({
  built: '',
  source: '',
  band: [0, 0],
  decks: [],
  puzzles: [],
})

export async function loadPuzzles(): Promise<PuzzleFile> {
  try {
    const r = await fetch('/data/puzzles.json')
    if (!r.ok) return emptyPuzzles()
    return { ...emptyPuzzles(), ...(await r.json()) }
  } catch {
    return emptyPuzzles()
  }
}

export interface PCard {
  key: string // history key
  line: Line
  start: number // ply the user takes over — 1 for puzzles (opp moves in), 0 for his blunders
  label: string // badge
  sub: string
  why: string // shown on a miss
  own: boolean // his own game, not lichess
  retry?: boolean // requeued copy — doesn't touch history
  rating?: number // lichess puzzle rating (025's floor ratchet filters on this); unset for his own cards
}

// Play uci moves from a fen into a Line the drill engine can walk.
function uciLine(fen: string, ucis: string[], name: string): Line | null {
  const c = new Chess(fen)
  try {
    for (const u of ucis)
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4) || undefined })
  } catch {
    return null // corrupt row — drop the card rather than deal a broken board
  }
  const moves = c.history({ verbose: true })
  if (!moves.length) return null
  return { idx: 0, name, system: 'Puzzle', trainAs: 'White', moves, comments: {}, fen }
}

const titleCase = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase())

export function puzzleCard(p: Puzzle, label: string): PCard | null {
  const ucis = p.moves.split(' ')
  const line = uciLine(p.fen, ucis, `puzzle ${p.id}`)
  if (!line || line.moves.length < 2) return null
  line.trainAs = line.moves[1].color === 'w' ? 'White' : 'Black'
  const solution = line.moves.filter((_, j) => j % 2 === 1)
  const motif = p.themes
    .split(' ')
    .filter((t) => /^(mateIn\d|fork|pin|skewer|hangingPiece|discoveredAttack|backRankMate|deflection|attraction|sacrifice|promotion|trappedPiece|capturingDefender|doubleCheck|smotheredMate)$/.test(t))
    .map(titleCase)
  return {
    key: `p:${p.id}`,
    line,
    start: 1,
    label,
    sub: `${p.rating} · ${solution.length === 1 ? 'one move' : solution.length + ' moves'}`,
    why: `${motif.join(', ') || 'Tactic'} — the line runs ${solution.map((m) => m.san).join(' ')}`,
    own: false,
    rating: p.rating,
  }
}

// His own flagged move (016), dealt back as a card: same position, find the move
// he missed. The why is 017's fact layer computed from what analysis already
// stored — deterministic and instant. ponytail: no LLM here; cards are a sprint.
export function blunderCard(a: Analysis, b: Blunder): PCard | null {
  const line = uciLine(b.fen, [b.best], `${a.desc} move ${Math.floor(b.ply / 2) + 1}`)
  if (!line) return null
  line.trainAs = line.moves[0].color === 'w' ? 'White' : 'Black'
  const facts = computeFacts({
    fen: b.fen,
    played: b.san,
    best: b.bestSan,
    bestLine: b.pvSan ?? [],
    punishLine: b.punishSan ?? [],
    swingCp: b.swingCp,
  })
  return {
    key: `o:${a.uuid}#${b.ply}`,
    line,
    start: 0,
    label: 'Your game',
    sub: `${a.desc} · move ${Math.floor(b.ply / 2) + 1}, you played ${b.san}`,
    why: `${b.bestSan} was there. ${facts.join(' ')}`,
    own: true,
  }
}

export function ownCards(analyses: Analysis[]): PCard[] {
  return analyses
    .flatMap((a) => a.blunders.map((b) => blunderCard(a, b)))
    .filter((c): c is PCard => c !== null)
}

export function lichessCards(file: PuzzleFile, deck?: string): PCard[] {
  const label = (k: string) => file.decks.find((d) => d.key === k)?.label ?? k
  return file.puzzles
    .filter((p) => !deck || p.deck === deck)
    .map((p) => puzzleCard(p, label(p.deck)))
    .filter((c): c is PCard => c !== null)
}

export const DEAL = 10
export const OWN_QUOTA = 4 // of every deal, up to this many are his own mistakes

// Weakest-first inside each source, with his own blunders holding a fixed share
// so a 360-puzzle pool can't drown the 20 mistakes that are actually his.
export function dealCards(
  lichess: PCard[],
  own: PCard[],
  h: History,
  ownOnly = false,
  size = DEAL,
): PCard[] {
  const rank = (cs: PCard[]) => byWeakness(cs, (c) => c.key, h.puzzles)
  const mine = rank(own).slice(0, ownOnly ? size : OWN_QUOTA)
  if (ownOnly && mine.length) return mine
  return [...mine, ...rank(lichess).slice(0, size - mine.length)]
}
