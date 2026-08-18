// Real opening theory (035): the vendored lichess/chess-openings positions,
// keyed by EPD so transposed move orders still match. This is the Book badge
// and the review's opening name — the repertoire book-walk stays its own signal.
export type Openings = Map<string, string> // epd -> "ECO name"

export const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export async function loadOpenings(): Promise<Openings> {
  const m: Openings = new Map()
  try {
    const text = await (await fetch('/data/openings.tsv')).text()
    for (const line of text.split('\n')) {
      const [e, eco, name] = line.split('\t')
      if (name) m.set(e, `${eco} ${name}`)
    }
  } catch {
    /* no book badges this session — analysis still runs */
  }
  return m
}

// Book plies are the unbroken run of known-theory positions from move 1; the
// deepest match names the game's opening. Once a position leaves the table the
// book is closed — re-entering theory later is coincidence, not preparation.
export function bookRun(fensAfter: string[], openings: Openings): { plies: number; name: string | null } {
  let name: string | null = null
  let plies = 0
  for (const f of fensAfter) {
    const hit = openings.get(epd(f))
    if (hit === undefined) break
    name = hit
    plies++
  }
  return { plies, name }
}
