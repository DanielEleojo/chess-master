// Learn content (030/031): system briefs + per-move teaching text, hand-authored
// and static — served from public/data/learn.json like traps.pgn/puzzles.json.
export interface LearnData {
  systems: Record<string, { plans: string; pawnBreaks: string; keySquares: string }>
  lines: Record<string, Record<string, string>>
}

export const emptyLearn = (): LearnData => ({ systems: {}, lines: {} })

// The move-number-qualified SAN key learn.json uses (031): "2.Nf3", "3...Bf5".
export function moveKey(ply: number, san: string): string {
  const n = Math.floor(ply / 2) + 1
  return ply % 2 === 0 ? `${n}.${san}` : `${n}...${san}`
}
