import { Chess } from 'chess.js'
import type { Move } from 'chess.js'

// One repertoire line or trap, parsed from a multi-game PGN file.
// For traps the Punisher tag plays the TrainAs role and system is 'Trap'.
export interface Line {
  idx: number
  name: string
  system: string
  trainAs: 'White' | 'Black'
  moves: Move[]
  comments: Record<string, string> // fen after the move -> why
  fen?: string // start position; unset = the initial position (set by puzzle cards, 013)
}

export function parseGames(raw: string): Line[] {
  return raw
    .trim()
    .split(/\n\s*\n(?=\[Event )/)
    .map((chunk, idx) => {
      const h: Record<string, string> = {}
      chunk.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => ((h[k] = v), ''))
      const c = new Chess()
      c.loadPgn(chunk)
      const comments: Record<string, string> = {}
      for (const o of c.getComments()) comments[o.fen] = o.comment
      return {
        idx,
        name: (h.Event ?? `game ${idx + 1}`).replace(/^(Repertoire|Trap):\s*/, ''),
        system: h.System ?? (h.Punisher ? 'Trap' : '?'),
        trainAs: (h.TrainAs ?? h.Punisher) === 'White' ? 'White' : ('Black' as const),
        moves: c.history({ verbose: true }),
        comments,
      }
    })
}
