// Own-game analysis (ticket 016) — walk a finished game with the engine, flag
// Daniel's eval swings, and record where the game left the repertoire book.
// Results persist to data/analysis.json keyed by uuid: blunder spots carry the
// before-FEN + best move so the tactics deck (013) can deal them, and `book`
// is the left-book signal the opening trainer's depth extension (003) reads.
import { Chess, type Move } from 'chess.js'
import type { Line } from './pgn'
import { sanLine, walkLine } from './facts'
import { bookRun, type Openings } from './openings'
import { USER, describeGame, type Game } from './sync'
import type { Engine } from './engine'

// Rough-take knobs — react to these first.
export const MOVE_MS = 300 // engine time per position; ~25s for an 80-ply game, reaches depth ~16+
const CAP = 1000 // clamp evals so mate-score swings don't explode (lichess caps win% input the same way)

export type FullGame = Game & { pgn: string; end_time: number; rules: string }

export const ANALYSIS_V = 5 // bump when the stored shape or knobs change — stale caches re-analyze

// --- lichess's open math (035) ---------------------------------------------
// win% from cp and per-move accuracy from win% drops, straight from
// lichess.org/page/accuracy — documented beats proprietary, so numbers land a
// few points off chess.com's CAPS for the same game, by design.
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp))) - 1)

// mover's win% before vs after; +1 is lichess's uncertainty bonus
export const moveAcc = (before: number, after: number) =>
  before <= after
    ? 100
    : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (before - after)) - 3.1669 + 1))

// Game accuracy per lichess: mean of (a) the volatility-weighted average —
// each move weighted by the win% standard deviation of a sliding window around
// it, so moves in wild phases count more — and (b) the harmonic mean.
export function gameAcc(evals: number[], color: 'w' | 'b'): number {
  const wp = evals.map(winPct)
  const n = evals.length - 1
  const win = Math.max(2, Math.min(8, Math.floor(n / 10)))
  const stdev = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
  }
  const accs: number[] = []
  const weights: number[] = []
  for (let j = color === 'w' ? 0 : 1; j < n; j += 2) {
    const before = color === 'w' ? wp[j] : 100 - wp[j]
    const after = color === 'w' ? wp[j + 1] : 100 - wp[j + 1]
    accs.push(moveAcc(before, after))
    weights.push(Math.max(0.5, Math.min(12, stdev(wp.slice(Math.max(0, j + 2 - win), j + 2)))))
  }
  if (!accs.length) return 100
  const weighted = accs.reduce((a, x, i) => a + x * weights[i], 0) / weights.reduce((a, b) => a + b, 0)
  // ponytail: floor 0.1 so one zero-accuracy move can't zero the whole harmonic term
  const harmonic = accs.length / accs.reduce((a, x) => a + 1 / Math.max(0.1, x), 0)
  return (weighted + harmonic) / 2
}

// --- move taxonomy (035): chess.com's full badge set -----------------------
export type Tag =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good'
  | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder'
export interface Judged {
  tag: Tag
  acc: number // this move's accuracy %
}

// win%-drop thresholds are lichess's published ones; the rest are our knobs
export const EXCELLENT_WIN = 2
export const INACCURACY_WIN = 10
export const MISTAKE_WIN = 20
export const BLUNDER_WIN = 30
export const GREAT_GAP = 20 // best beats second-best by this much win% = the only move
export const SAC_PTS = 2 // material the best line concedes to count as a sacrifice
export const BRILLIANT_CAP = 85 // sacs from ≥ this win% were already trivially winning
export const MISS_WIN = 75 // winning ≥ this and letting ≥10 win% slip = Miss, not inaccuracy

export function judgeMoves(
  moves: Move[],
  evals: number[], // white-centric, length moves+1
  cp2s: (number | null)[], // second-best per position, white-centric (MultiPV 2)
  pvs: string[][],
  bookPlies: number,
): Judged[] {
  return moves.map((m, j) => {
    const my = (cp: number) => (m.color === 'w' ? winPct(cp) : 100 - winPct(cp))
    const before = my(evals[j])
    const after = my(evals[j + 1])
    const acc = moveAcc(before, after)
    const drop = Math.max(0, before - after)
    const tag = (): Tag => {
      if (j < bookPlies) return 'book'
      if (m.from + m.to + (m.promotion ?? '') === pvs[j]?.[0]) {
        const second = cp2s[j]
        // brilliant: the engine best *and* it gives up material along its own
        // line (facts.ts material walk) *and* he wasn't already coasting.
        // "Coasting" reads the SECOND-best move — the eval before a forced
        // mate sac is already ~100%, so the best line can't measure it.
        if (
          my(second ?? evals[j]) < BRILLIANT_CAP &&
          walkLine(m.before, sanLine(m.before, pvs[j], 8)).gain <= -SAC_PTS
        )
          return 'brilliant'
        if (second !== null && before - my(second) >= GREAT_GAP) return 'great'
        return 'best'
      }
      if (drop >= BLUNDER_WIN) return 'blunder'
      if (drop >= INACCURACY_WIN && before >= MISS_WIN) return 'miss'
      if (drop >= MISTAKE_WIN) return 'mistake'
      if (drop >= INACCURACY_WIN) return 'inaccuracy'
      return drop >= EXCELLENT_WIN ? 'good' : 'excellent'
    }
    return { tag: tag(), acc }
  })
}

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
  judged: Judged[] // per-ply tag + accuracy, both players
  acc: { w: number; b: number } // game accuracy per player, review header
  opening: string | null // deepest theory position matched (openings.tsv)
  blunders: Blunder[]
  book: BookInfo | null
}

const clamp = (cp: number) => Math.max(-CAP, Math.min(CAP, cp))

// The 013 tactics-card feed, unchanged by the taxonomy: only mistake-grade and
// worse become cards/prose — a Miss is a mistake that happened while winning.
const FLAG: Partial<Record<Tag, Blunder['severity']>> = {
  blunder: 'blunder',
  mistake: 'mistake',
  miss: 'mistake',
}

export function flagMoves(
  moves: Move[],
  evals: number[],
  pvs: string[][],
  color: 'w' | 'b',
  judged: Judged[],
): Blunder[] {
  const out: Blunder[] = []
  moves.forEach((m, j) => {
    if (m.color !== color) return
    const severity = FLAG[judged[j]?.tag as Tag]
    if (!severity) return
    const swing =
      color === 'w' ? clamp(evals[j]) - clamp(evals[j + 1]) : clamp(evals[j + 1]) - clamp(evals[j])
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
      swingCp: Math.max(0, swing),
      severity,
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
  openings: Openings,
  engine: Engine,
  onProgress: (done: number, total: number) => void,
): Promise<Analysis> {
  const c = new Chess()
  c.loadPgn(game.pgn)
  const moves = c.history({ verbose: true })
  const color: 'w' | 'b' = game.white.username.toLowerCase() === USER ? 'w' : 'b'
  const fens = [new Chess().fen(), ...moves.map((m) => m.after)]
  const evals: number[] = []
  const cp2s: (number | null)[] = []
  const pvs: string[][] = []
  for (let i = 0; i < fens.length; i++) {
    const stm: 'w' | 'b' = i === 0 ? 'w' : moves[i - 1].color === 'w' ? 'b' : 'w'
    const pos = new Chess(fens[i])
    if (pos.isGameOver()) {
      // ponytail: terminal positions skip the engine — mate is ±10000, any draw 0
      evals.push(pos.isCheckmate() ? (stm === 'w' ? -10000 : 10000) : 0)
      cp2s.push(null)
      pvs.push([])
    } else {
      // MultiPV 2 (035): the second-best score is what makes Great calls possible
      const s = await engine.evalFen(fens[i], MOVE_MS, 2)
      evals.push(stm === 'w' ? s.cp : -s.cp)
      cp2s.push(s.cp2 === null ? null : stm === 'w' ? s.cp2 : -s.cp2)
      pvs.push(s.pv.length ? s.pv : s.best ? [s.best] : [])
    }
    onProgress(i + 1, fens.length)
  }
  const { plies: bookPlies, name: opening } = bookRun(moves.map((m) => m.after), openings)
  const judged = judgeMoves(moves, evals, cp2s, pvs, bookPlies)
  return {
    uuid: game.uuid,
    at: new Date().toISOString(),
    v: ANALYSIS_V,
    ms: MOVE_MS,
    color,
    desc: describeGame(game),
    endTime: game.end_time,
    evals,
    judged,
    acc: { w: gameAcc(evals, 'w'), b: gameAcc(evals, 'b') },
    opening,
    blunders: flagMoves(moves, evals, pvs, color, judged),
    // ponytail: sparring replays a book line by construction (014), so counting it
    // would invent left-book and extension evidence he never produced.
    book:
      game.time_class === SPAR_TC
        ? null
        : bookWalk(moves.map((m) => m.san), color, repertoire),
  }
}

// --- sparring games (014) ------------------------------------------------
// A finished spar game is recorded as one of his games and nothing more: the
// analysis list deals it, this same walk flags it, and from there the coach's
// blunder clusters and the tactics deck's own-mistake cards read it with no
// rung of their own. Never rated — the milestone ladder stays real ratings.
export const SPAR_TC = 'sparring'

export function sparGame(
  c: Chess,
  my: 'w' | 'b',
  opp: string,
  resigned: boolean,
  atSec: number,
): FullGame {
  const drawn = !resigned && !c.isCheckmate()
  const mine = resigned
    ? 'resigned'
    : drawn
      ? c.isStalemate()
        ? 'stalemate'
        : c.isInsufficientMaterial()
          ? 'insufficient'
          : c.isThreefoldRepetition()
            ? 'repetition'
            : '50move'
      : c.turn() !== my
        ? 'win'
        : 'checkmated'
  const me = { username: USER, result: mine }
  const them = { username: opp, result: drawn ? mine : mine === 'win' ? 'checkmated' : 'win' }
  return {
    uuid: `spar-${atSec}`,
    time_class: SPAR_TC,
    rated: false,
    end_time: atSec,
    rules: 'chess',
    pgn: c.pgn(),
    white: my === 'w' ? me : them,
    black: my === 'w' ? them : me,
  }
}

export async function loadSparGames(): Promise<FullGame[]> {
  try {
    const r = await fetch('/api/data/spar-games')
    if (r.ok) {
      const s = await r.json()
      if (Array.isArray(s.games)) return s.games
    }
  } catch {
    /* fall through */
  }
  return []
}

export async function saveSparGame(g: FullGame): Promise<void> {
  const games = [...(await loadSparGames()), g]
  await fetch('/api/data/spar-games', { method: 'PUT', body: JSON.stringify({ games }, null, 1) })
  // unseen too, so the coach's top rung nags him to review it like a real arrival
  try {
    const st: { unseen?: string[] } = await fetch('/api/data/sync-state').then((r) =>
      r.ok ? r.json() : {},
    )
    st.unseen = [...new Set([...(st.unseen ?? []), g.uuid])]
    void fetch('/api/data/sync-state', { method: 'PUT', body: JSON.stringify(st, null, 1) })
  } catch {
    /* the game is stored; the badge is the only loss */
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
