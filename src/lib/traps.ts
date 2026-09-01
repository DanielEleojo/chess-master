// Trap card deck (tickets 005/011) — one card per commented punisher move.
//
// Split out of TrapCards.tsx so the selftest can build a deck without React.

import type { Line } from './pgn'
import { userMoveIdxs } from './drill'

export interface Card {
  line: Line
  k: number // ply index of the punishing move to find
  key: string
  retry?: boolean // requeued copy of a missed card — doesn't touch history
}

// The comment on a punisher move is the "why" shown on the card. Traps with no
// commented punisher move (pure mates) quiz the final blow.
export function buildDeck(traps: Line[]): Card[] {
  const deck: Card[] = []
  for (const t of traps) {
    const uc = t.trainAs === 'White' ? 'w' : 'b'
    const commented = t.moves
      .map((m, j) => ({ m, j }))
      .filter(({ m }) => m.color === uc && t.comments[m.after])
    const picks = commented.length
      ? commented
      : userMoveIdxs(t)
          .slice(-1)
          .map((j) => ({ m: t.moves[j], j }))
    for (const { j } of picks) deck.push({ line: t, k: j, key: `${t.name}#${j}` })
  }
  return deck
}
