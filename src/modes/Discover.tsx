import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Api } from 'chessground/api'
import { ModeHead } from '../components/ModeHead'
import { Board, syncBoard } from '../components/Board'
import { coachPitch } from '../lib/coach'
import { openingGaps, type OpeningGap } from '../lib/discover'
import { useLater } from '../lib/fx'
import { loadOpenings } from '../lib/openings'
import type { Line } from '../lib/pgn'
import type { FullGame } from '../lib/analyze'

// Openings to learn: complements Next Rung's "deepen what you have" (left-line
// and extend picks in recommend.ts) with "what don't you have at all" — real
// openings his games actually reach that no repertoire line answers, ranked by
// frequency and result. No engine needed: this reads book-walk + vendored
// theory off his synced games, so it doesn't wait on a Stockfish scan.
const COLOR_WORD = { w: 'White', b: 'Black' } as const

// Show, don't tell (same fix as Line Drill's demoExpected): plays the deepest
// theory line seen for this gap on a real board instead of naming moves in
// prose. Keyed by gap identity at the call site, so picking a different row
// remounts this fresh — cleanly cancels whatever was mid-animation.
function OpeningBoard({ gap }: { gap: OpeningGap }) {
  const cgRef = useRef<Api | null>(null)
  const later = useLater()
  useEffect(() => {
    const cg = cgRef.current!
    const chess = new Chess()
    cg.set({ orientation: gap.color === 'w' ? 'white' : 'black' })
    syncBoard(cg, chess, gap.color, false, null)
    const step = (i: number) => {
      if (i >= gap.sample.length) return
      const m = chess.move(gap.sample[i])
      syncBoard(cg, chess, gap.color, false, m ? [m.from, m.to] : null)
      later(650, () => step(i + 1))
    }
    later(500, () => step(0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <Board size={340} onReady={(api) => (cgRef.current = api)} onMove={() => {}} />
}

export function Discover({ lines, user, onExit }: { lines: Line[]; user: string; onExit: () => void }) {
  const [gaps, setGaps] = useState<OpeningGap[] | null>(null)
  const [sel, setSel] = useState(0)
  const [prose, setProse] = useState('')

  useEffect(() => {
    ;(async () => {
      const [months, openings] = await Promise.all([
        fetch('/api/data/archives').then((r) => (r.ok ? r.json() : [])),
        loadOpenings(),
      ])
      const games: FullGame[] = (
        await Promise.all(
          (months as string[]).map((m) =>
            fetch(`/api/data/archives/${m}`).then((r) => (r.ok ? r.json() : { games: [] })),
          ),
        )
      ).flatMap((a) => a.games ?? [])
      setGaps(openingGaps(games, user, lines, openings))
    })().catch(() => setGaps([]))
  }, [user, lines])

  useEffect(() => {
    if (!gaps?.length) return
    const top = gaps[0]
    void coachPitch(
      `discover:${top.color}:${top.name}:${top.games}`,
      `He has no repertoire line for the ${top.name} as ${COLOR_WORD[top.color]}.`,
      {
        title: `Learn the ${top.name}`,
        evidence: gaps
          .slice(0, 3)
          .map((g) => `as ${COLOR_WORD[g.color]}: ${g.name} in ${g.games} games (${g.wins}-${g.losses}-${g.draws})`),
      },
    ).then((t) => t && setProse(t))
  }, [gaps])

  const active = gaps?.[sel]

  return (
    <>
      <ModeHead
        title="Openings to learn"
        sub="real openings your games reach with no repertoire line — from every synced game, no scan needed"
        onExit={onExit}
      />
      {prose && (
        <div className="coachcard">
          <span className="coachmark" aria-hidden="true">
            ?
          </span>
          <p className="coachprose">{prose}</p>
        </div>
      )}
      {gaps === null ? (
        <p className="dim">reading your synced games…</p>
      ) : gaps.length === 0 ? (
        <p className="dim">no recurring gap yet — either too few games synced, or your repertoire covers what you face</p>
      ) : (
        <>
          {active && active.sample.length > 0 && (
            <div className="play">
              <div>
                <OpeningBoard key={`${active.color}:${active.name}`} gap={active} />
              </div>
            </div>
          )}
          <div className="ledger">
            {gaps.map((g, i) => (
              <button
                key={`${g.color}:${g.name}`}
                className={`row${i === sel ? ' active' : ''}`}
                onClick={() => setSel(i)}
              >
                <span className="name">
                  {g.name} <span className="dim">· as {COLOR_WORD[g.color]}</span>
                </span>
                <span className="what">no repertoire line matches this opening</span>
                <span className="stat">
                  <span className="bad">{g.games}</span> games · {g.wins}-{g.losses}-{g.draws}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
