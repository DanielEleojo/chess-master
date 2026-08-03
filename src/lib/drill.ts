import { Chess } from 'chess.js'
import type { Move } from 'chess.js'
import type { Line } from './pgn'

// Ported from prototypes/drill-flow.html (ticket 005) — the one shared drill engine.

export const userMoveIdxs = (l: Line): number[] => {
  const uc = l.trainAs === 'White' ? 'w' : 'b'
  return l.moves.map((m, j) => (m.color === uc ? j : -1)).filter((j) => j >= 0)
}

export interface TryResult {
  ok: boolean
  exp: Move
  got: Move | null
}

export interface Drill {
  chess: Chess
  uc: 'w' | 'b'
  readonly i: number
  done(): boolean
  expected(): Move
  autoMoves(): Move[]
  tryMove(from: string, to: string): TryResult
}

export function makeDrill(line: Line, start = 0): Drill {
  const chess = new Chess()
  for (let j = 0; j < start; j++) chess.move(line.moves[j].san)
  const uc = line.trainAs === 'White' ? 'w' : 'b'
  let i = start
  return {
    chess,
    uc,
    get i() {
      return i
    },
    done: () => i >= line.moves.length,
    expected: () => line.moves[i],
    autoMoves() {
      const out: Move[] = []
      while (i < line.moves.length && line.moves[i].color !== uc) {
        chess.move(line.moves[i].san)
        out.push(line.moves[i])
        i++
      }
      return out
    },
    tryMove(from, to) {
      const exp = line.moves[i]
      let mv: Move | null = null
      try {
        mv = chess.move({ from, to })
      } catch {
        // ponytail: auto-queen instead of a promotion picker — no seed line or trap
        // reaches promotion; build the picker when puzzle data does.
        try {
          mv = chess.move({ from, to, promotion: 'q' })
        } catch {
          return { ok: false, exp, got: null }
        }
      }
      if (mv.san === exp.san) {
        i++
        return { ok: true, exp, got: mv }
      }
      chess.undo()
      return { ok: false, exp, got: mv }
    },
  }
}

export function sanUpto(line: Line, k: number): string {
  let s = ''
  for (let j = 0; j < k; j++) {
    const m = line.moves[j]
    if (m.color === 'w') s += Math.floor(j / 2) + 1 + '. '
    s += m.san + ' '
  }
  return s.trim() || '(start position)'
}
