import { useEffect, useRef, useState } from 'react'
import type { Api } from 'chessground/api'
import type { Line } from '../lib/pgn'
import { makeDrill, sanUpto, userMoveIdxs, type Drill } from '../lib/drill'
import { Board, syncBoard } from '../components/Board'
import { beep, shake, useLater } from '../lib/fx'
import { bump, byWeakness, saveHistory, type History } from '../lib/history'

export interface Card {
  line: Line
  k: number // ply index of the punishing move to find
  key: string
}

// One card per commented punisher move — the comment is the "why" shown on the
// card. Traps with no commented punisher move (pure mates) quiz the final blow.
export function buildDeck(traps: Line[]): Card[] {
  const deck: Card[] = []
  for (const t of traps) {
    const uc = t.trainAs === 'White' ? 'w' : 'b'
    const commented = t.moves
      .map((m, j) => ({ m, j }))
      .filter(({ m }) => m.color === uc && t.comments[m.after])
    const picks = commented.length ? commented : userMoveIdxs(t).slice(-1).map((j) => ({ m: t.moves[j], j }))
    for (const { j } of picks) deck.push({ line: t, k: j, key: `${t.name}#${j}` })
  }
  return deck
}

const DEAL = 10

// A's card-sprint shell (ticket 005), refilled with real-game junk punishment:
// position from a trap he actually meets, find the one punishing move.
// Miss = arrow + the why, then play it to continue.
export function TrapCards({
  traps,
  history,
  onExit,
}: {
  traps: Line[]
  history: History
  onExit: () => void
}) {
  const [cards] = useState<(Card & { result: 'good' | 'bad' | null })[]>(() =>
    byWeakness(buildDeck(traps), (c) => c.key, history.traps)
      .slice(0, DEAL)
      .map((c) => ({ ...c, result: null })),
  )
  const [ci, setCi] = useState(0)
  const [, force] = useState(0) // dots repaint after result mutation
  const [prompt, setPrompt] = useState<{ text: string; cls: string }>({ text: 'Your move.', cls: '' })
  const [coach, setCoach] = useState('')

  const cg = useRef<Api | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const st = useRef({ drill: null as Drill | null, lm: null as [string, string] | null })
  const later = useLater()

  function show(idx: number) {
    if (idx >= cards.length) {
      finish()
      return
    }
    const c = cards[idx]
    st.current.drill = makeDrill(c.line, c.k)
    st.current.lm = c.k > 0 ? [c.line.moves[c.k - 1].from, c.line.moves[c.k - 1].to] : null
    cg.current!.setAutoShapes([])
    cg.current!.set({ orientation: c.line.trainAs === 'White' ? 'white' : 'black' })
    syncBoard(cg.current!, st.current.drill.chess, st.current.drill.uc, true, st.current.lm)
    setCi(idx)
    setPrompt({ text: 'Your move.', cls: '' })
    setCoach('')
  }

  function onMove(from: string, to: string) {
    const s = st.current
    if (!s.drill || s.drill.done()) return
    const c = cards[ci]
    const r = s.drill.tryMove(from, to)
    const cmt = c.line.comments[r.exp.after]
    if (r.ok) {
      const first = c.result === null
      c.result ??= 'good'
      cg.current!.setAutoShapes([])
      syncBoard(cg.current!, s.drill.chess, s.drill.uc, false, [r.got!.from, r.got!.to])
      setPrompt({
        text: first ? `✓ ${r.exp.san}` : `✓ ${r.exp.san} — got it after the reveal`,
        cls: c.result,
      })
      if (first && cmt) setCoach(cmt)
      beep(true)
      force((n) => n + 1)
      later(cmt && first ? 1700 : 900, () => show(ci + 1))
    } else {
      c.result ??= 'bad'
      setPrompt({
        text: `✗ ${r.got ? r.got.san : 'illegal'} — the punish is ${r.exp.san}. Play it to continue.`,
        cls: 'bad',
      })
      setCoach(cmt ?? '')
      beep(false)
      shake(wrap.current)
      force((n) => n + 1)
      syncBoard(cg.current!, s.drill.chess, s.drill.uc, true, s.lm)
      cg.current!.setAutoShapes([{ orig: r.exp.from, dest: r.exp.to, brush: 'green' }])
    }
  }

  function finish() {
    st.current.drill = null // the last card's drill may not be done() mid-line; stop taking moves
    for (const c of cards) bump(history.traps, c.key, c.result === 'bad')
    history.sessions.push({
      mode: 'traps',
      at: new Date().toISOString(),
      cards: cards.length,
      good: cards.filter((c) => c.result === 'good').length,
    })
    saveHistory(history)
    setCi(cards.length)
  }

  useEffect(() => {
    ;(window as any).cmExpected = () => // dev hook, pairs with cmMove
      st.current.drill && !st.current.drill.done() ? st.current.drill.expected() : null
    show(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = ci >= cards.length
  const c = cards[ci]
  const good = cards.filter((x) => x.result === 'good').length
  return (
    <div className="cards">
      <div>
        <h2>Trap cards</h2>
        <div className="sub">
          the junk you actually face · one punishing move each · miss = see why, then play it
        </div>
      </div>
      <div className="dots">
        {cards.map((x, i) => (
          <span key={i} className={'dot' + (x.result ? ' ' + x.result : '') + (i === ci ? ' cur' : '')} />
        ))}
      </div>
      {!done && c && (
        <div className="card cardface">
          <div className="meta">
            <span className="badge">Trap</span> <b>{c.line.name}</b>{' '}
            <span>you punish as {c.line.trainAs}</span>
          </div>
          <div className="sofar">{sanUpto(c.line, c.k)}</div>
          <div ref={wrap}>
            <Board size={400} onReady={(api) => (cg.current = api)} onMove={onMove} />
          </div>
          <div className={'prompt ' + prompt.cls}>{prompt.text}</div>
          <div className="coach">{coach}</div>
        </div>
      )}
      {done && (
        <div className="card cardface">
          <h2>
            {good}/{cards.length}
          </h2>
          <div className="sub">
            {good === cards.length ? 'clean sweep — they walk into these, you collect' : 'missed traps come back first next deal'}
          </div>
          <ul className="misslist">
            {cards.map((x, i) => (
              <li key={i}>
                {x.result === 'good' ? '✓' : '✗'} {x.line.name} — move {Math.floor(x.k / 2) + 1} as{' '}
                {x.line.trainAs}
              </li>
            ))}
          </ul>
          <button onClick={onExit}>Home</button>
        </div>
      )}
    </div>
  )
}
