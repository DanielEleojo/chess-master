// Fact layer (ticket 017, ADR 0001): deterministic truths about a flagged move,
// computed with chess.js by walking the engine's lines. The coach voice only
// phrases these; when Ollama is down the joined facts ARE the explanation.
// ponytail: vocabulary is material/mate/fork/checks/castling — pins and lost
// tempo wait until Daniel's games show facts these words can't express.
import { Chess, type Move } from 'chess.js'

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

// uci pv -> san moves, stopping at the first move that doesn't parse
export function sanLine(fen: string, uci: string[], max = 6): string[] {
  const out: string[] = []
  try {
    const c = new Chess(fen)
    for (const u of uci.slice(0, max))
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
  } catch {
    /* keep whatever parsed */
  }
  return out
}

export interface FactsIn {
  fen: string // position before the move
  played: string // san — the move Daniel played (or tried, in a drill)
  best: string // san — engine best, or the repertoire move in a drill
  bestLine: string[] // san from fen, starting with best
  punishLine: string[] // san from the position after played — the refutation
  swingCp: number // what played loses vs best, from the mover's side
}

export interface Walked {
  sans: string[]
  moves: Move[]
  mate: boolean // line ends in checkmate delivered by the first mover
  checks: number // checks the first mover gives along the line
  gain: number // net material for the first mover, pawn units
  biggest: string | null // most valuable piece the first mover captures
}

// exported for 035's Brilliant call — a best line whose material walk goes
// negative for the mover is a sacrifice
export function walkLine(fen: string, sans: string[]): Walked {
  const c = new Chess(fen)
  const first = c.turn()
  const moves: Move[] = []
  let gain = 0
  let checks = 0
  let big = 0
  let biggest: string | null = null
  for (const s of sans) {
    let m: Move
    try {
      m = c.move(s)
    } catch {
      break
    }
    moves.push(m)
    if (m.captured) {
      const v = VAL[m.captured]
      if (m.color === first) {
        gain += v
        if (v > big) ((big = v), (biggest = m.captured))
      } else gain -= v
    }
    if (m.color === first && c.inCheck()) checks++
  }
  const last = moves[moves.length - 1]
  return { sans: moves.map((m) => m.san), moves, mate: c.isCheckmate() && last?.color === first, checks, gain, biggest }
}

const pts = (n: number) => (n === 1 ? 'a pawn' : `about ${n} points of material`)

// What does the opponent's reply piece attack? Swap the turn to generate its
// moves from a position where it just moved (only sound when not giving check).
function forkTargets(fenAfterReply: string, sq: string): Move[] {
  const parts = fenAfterReply.split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  parts[3] = '-'
  try {
    const seen = new Set<string>()
    return new Chess(parts.join(' '))
      .moves({ square: sq as Move['to'], verbose: true })
      .filter((m) => m.captured && VAL[m.captured] >= 3 && !seen.has(m.to) && seen.add(m.to) !== undefined)
  } catch {
    return []
  }
}

export function computeFacts(f: FactsIn): string[] {
  const facts: string[] = []
  const c = new Chess(f.fen)
  const me = c.turn()
  let played: Move
  try {
    played = c.move(f.played)
  } catch {
    return [`${f.played} is not a legal move here.`]
  }
  const after = c.fen()

  // castling thrown away by a bare king move
  const rights = (fen: string) => fen.split(' ')[2]
  const myRights = (r: string) => (me === 'w' ? /[KQ]/.test(r) : /[kq]/.test(r))
  if (played.piece === 'k' && !played.san.startsWith('O-O') && myRights(rights(f.fen)) && !myRights(rights(after)))
    facts.push(`${f.played} gives up castling — your king is stuck in the middle for good.`)

  const punish = walkLine(after, f.punishLine)
  const p0 = punish.moves[0]
  const line = punish.sans.join(' ')
  if (punish.mate) facts.push(`After ${f.played} the reply ${line} ends in checkmate.`)
  else if (p0) {
    if (p0.captured && p0.to === played.to)
      facts.push(`${f.played} puts the ${NAME[played.piece]} on a square the opponent controls — ${p0.san} just takes it.`)
    // skip the material line when it only restates that immediate capture
    if (punish.gain >= 1 && !(p0.to === played.to && punish.gain <= VAL[played.piece]))
      facts.push(
        `After ${f.played}, ${line} wins ${
          punish.biggest && VAL[punish.biggest] >= 3 ? `your ${NAME[punish.biggest]}` : pts(punish.gain)
        }${punish.gain >= 1 && punish.biggest && VAL[punish.biggest] > punish.gain ? ` (net ${pts(punish.gain)} after recaptures)` : ''}.`,
      )
    if (!c.inCheck()) {
      const d = new Chess(after)
      try {
        const m0 = d.move(p0.san)
        if (!d.inCheck()) {
          const names = forkTargets(d.fen(), m0.to).map((t) => NAME[t.captured!])
          if (names.length >= 2)
            facts.push(
              `${p0.san} forks ${
                names.length === 2 && names[0] === names[1] ? `both your ${names[0]}s` : `your ${names.join(' and ')}`
              }.`,
            )
        }
      } catch {
        /* no fork fact */
      }
    }
    if (punish.checks >= 2) facts.push(`Your king gets dragged through checks along the way.`)
  }

  const bestW = walkLine(f.fen, f.bestLine)
  if (bestW.mate) facts.push(`Instead, ${bestW.sans.join(' ')} forces checkmate for you.`)
  else if (bestW.gain >= 1)
    facts.push(`The better move ${f.best} wins ${bestW.biggest && VAL[bestW.biggest] >= 3 ? `the ${NAME[bestW.biggest]}` : pts(bestW.gain)}: ${bestW.sans.join(' ')}.`)

  if (!facts.length)
    facts.push(
      `Nothing hangs — the cost is positional: ${f.best} keeps building your position while ${f.played} hands back about ${(f.swingCp / 100).toFixed(1)} pawns of advantage.`,
    )
  return facts
}
