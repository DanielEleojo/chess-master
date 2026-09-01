// Sparring strength (ticket 014) — how weak the engine plays, and how it picks.
//
// Lives here rather than in engine.ts or Spar.tsx so it stays reachable from
// plain Node: engine.ts imports Stockfish's worker via a Vite `?url` specifier,
// and Spar.tsx pulls in React. Both are fatal to `npm test`, and none of this
// needs either.

export interface Weak {
  nodes: number
  multipv: number
  temp: number // 0 = always the top move
}

// Starving the search (nodes 1) did NOT make it weak — Stockfish's move
// ordering defends scholar's mate on one node. The real dial is *randomness*:
// search wide enough to have candidates, then pick sloppily among them.
// `temp` is in centipawns — the loss a move can carry and still get played
// ~37% as often as the best one.
// No Skill Level: it only rewrites Stockfish's *bestmove*, which this discards
// in favour of its own pick — measured inert, so it's gone.
export function softmaxPick(cands: { mv: string; cp: number }[], temp: number): string {
  if (temp <= 0) return cands[0].mv
  const top = Math.max(...cands.map((c) => c.cp))
  const ws = cands.map((c) => Math.exp(Math.max(c.cp - top, -4000) / temp))
  let r = Math.random() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ws.length; i++) if ((r -= ws[i]) <= 0) return cands[i].mv
  return cands[0].mv
}

export const RUNGS: (Weak & { name: string; blurb: string })[] = [
  {
    name: 'Careless',
    nodes: 500,
    multipv: 8,
    temp: 900,
    blurb: 'hangs pieces for free — the floor',
  },
  {
    name: 'Rookie',
    nodes: 500,
    multipv: 6,
    temp: 350,
    blurb: 'blunders often, misses your threats',
  },
  {
    name: 'Beginner',
    nodes: 800,
    multipv: 4,
    temp: 140,
    blurb: 'takes what you leave hanging, no plan',
  },
  {
    name: 'Improver',
    nodes: 4000,
    multipv: 3,
    temp: 55,
    blurb: 'punishes loose pieces, spots short tactics',
  },
  {
    name: 'Club player',
    nodes: 40000,
    multipv: 1,
    temp: 0,
    blurb: 'always its best move — you need a real idea',
  },
]

// Round 4 (Daniel): one win is luck, two is a level. The climb knob.
export const WINS_TO_CLIMB = 2
