// Own-game analysis (ticket 016) — walk a finished game with the engine, flag
// Daniel's eval swings, and record where the game left the repertoire book.
// Results persist to data/analysis.json keyed by uuid: blunder spots carry the
// before-FEN + best move so the tactics deck (013) can deal them, and `book`
// is the left-book signal the opening trainer's depth extension (003) reads.
import { Chess, type Move } from 'chess.js'
import type { Line } from './pgn'
import { sanLine } from './facts'
import { USER, describeGame, type Game } from './sync'
import type { Engine } from './engine'

// Rough-take knobs — react to these first.
export const MOVE_MS = 300 // engine time per position; ~25s for an 80-ply game, reaches depth ~16+
export const MISTAKE_CP = 100
export const BLUNDER_CP = 250
const CAP = 1000 // clamp evals so mate-score swings don't explode

export type FullGame = Game & { pgn: string; end_time: number; rules: string }

export const ANALYSIS_V = 4 // bump when the stored shape or knobs change — stale caches re-analyze

export interface Blunder {
  ply: number // 0-based ply index of the flagged move
  san: string
  fen: string // position before the move — a future tactics card (013)
  best: string // uci
  bestSan: string
  pvSan: string[] // best move plus its follow-up — the why in moves
  punishSan: string[] // opponent's best line after the played move — what facts.ts walks (017)
  swingCp: number
  severity: 'blunder' | 'mistake'
}

export interface BookInfo {
  line: string // deepest-matching repertoire line
  matchedPlies: number
  leftAtPly: number | null // null = in book to the end of the line
  by: 'me' | 'opp' | null
  expectedSan: string | null // what the repertoire wanted, when I left it
  oppSan: string | null // opponent's actually-played move at the break (019's branch/tail seed)
  outlived: boolean // matched the whole line and the game kept going — tail candidate
}

export interface Analysis {
  uuid: string
  at: string
  v: number // ANALYSIS_V this was produced by
  ms: number // engine time/position this was run at — shallower caches re-analyze
  color: 'w' | 'b'
  desc: string
  endTime: number
  evals: number[] // white-centric cp; evals[0] = start position
  blunders: Blunder[]
  book: BookInfo | null
}

const clamp = (cp: number) => Math.max(-CAP, Math.min(CAP, cp))

export function flagMoves(
  moves: Move[],
  evals: number[],
  pvs: string[][],
  color: 'w' | 'b',
): Blunder[] {
  const out: Blunder[] = []
  moves.forEach((m, j) => {
    if (m.color !== color) return
    const swing =
      color === 'w' ? clamp(evals[j]) - clamp(evals[j + 1]) : clamp(evals[j + 1]) - clamp(evals[j])
    if (swing < MISTAKE_CP) return
    const pv = pvs[j] ?? []
    const pvSan = sanLine(m.before, pv, 5)
    out.push({
      ply: j,
      san: m.san,
      fen: m.before,
      best: pv[0] ?? '',
      bestSan: pvSan[0] ?? '?',
      pvSan,
      punishSan: sanLine(m.after, pvs[j + 1] ?? [], 5),
      swingCp: swing,
      severity: swing >= BLUNDER_CP ? 'blunder' : 'mistake',
    })
  })
  return out
}

// Longest matching prefix across the repertoire lines for his color; where the
// match stops, whoever moved next left book.
export function bookWalk(sans: string[], color: 'w' | 'b', lines: Line[]): BookInfo | null {
  let best: { line: Line; n: number } | null = null
  for (const l of lines) {
    if ((l.trainAs === 'White' ? 'w' : 'b') !== color) continue
    let n = 0
    while (n < l.moves.length && n < sans.length && l.moves[n].san === sans[n]) n++
    if (!best || n > best.n) best = { line: l, n }
  }
  if (!best || best.n === 0) return null
  const { line, n } = best
  const ended = n >= line.moves.length || n >= sans.length
  const by = ended ? null : line.moves[n].color === color ? 'me' : 'opp'
  return {
    line: line.name,
    matchedPlies: n,
    leftAtPly: ended ? null : n,
    by,
    expectedSan: by === 'me' ? line.moves[n].san : null,
    // the game's move at ply n, when it exists and is the opponent's turn
    oppSan: n < sans.length && (n % 2 === 0 ? 'w' : 'b') !== color ? sans[n] : null,
    outlived: n >= line.moves.length && n < sans.length,
  }
}

export async function analyzeGame(
  game: FullGame,
  repertoire: Line[],
  engine: Engine,
  onProgress: (done: number, total: number) => void,
): Promise<Analysis> {
  const c = new Chess()
  c.loadPgn(game.pgn)
  const moves = c.history({ verbose: true })
  const color: 'w' | 'b' = game.white.username.toLowerCase() === USER ? 'w' : 'b'
  const fens = [new Chess().fen(), ...moves.map((m) => m.after)]
  const evals: number[] = []
  const pvs: string[][] = []
  for (let i = 0; i < fens.length; i++) {
    const stm: 'w' | 'b' = i === 0 ? 'w' : moves[i - 1].color === 'w' ? 'b' : 'w'
    const pos = new Chess(fens[i])
    if (pos.isGameOver()) {
      // ponytail: terminal positions skip the engine — mate is ±10000, any draw 0
      evals.push(pos.isCheckmate() ? (stm === 'w' ? -10000 : 10000) : 0)
      pvs.push([])
    } else {
      const s = await engine.evalFen(fens[i], MOVE_MS)
      evals.push(stm === 'w' ? s.cp : -s.cp)
      pvs.push(s.pv.length ? s.pv : s.best ? [s.best] : [])
    }
    onProgress(i + 1, fens.length)
  }
  return {
    uuid: game.uuid,
    at: new Date().toISOString(),
    v: ANALYSIS_V,
    ms: MOVE_MS,
    color,
    desc: describeGame(game),
    endTime: game.end_time,
    evals,
    blunders: flagMoves(moves, evals, pvs, color),
    book: bookWalk(moves.map((m) => m.san), color, repertoire),
  }
}

// data/analysis.json via the data middleware (004)
export interface AnalysisStore {
  games: Record<string, Analysis>
}

export async function loadAnalyses(): Promise<AnalysisStore> {
  try {
    const r = await fetch('/api/data/analysis')
    if (r.ok) {
      const s = await r.json()
      if (s.games) return s
    }
  } catch {
    /* fall through */
  }
  return { games: {} }
}

export function saveAnalyses(s: AnalysisStore): void {
  void fetch('/api/data/analysis', { method: 'PUT', body: JSON.stringify(s, null, 1) })
}
