import { useEffect, useRef, useState } from 'react'
import type { Api } from 'chessground/api'
import type { Line } from '../lib/pgn'
import { makeDrill, sanUpto, type Drill } from '../lib/drill'
import { buildDeck, type Card } from '../lib/traps'
import { Board, syncBoard } from '../components/Board'
import { ModeHead } from '../components/ModeHead'
import { beep, shake, useLater } from '../lib/fx'
import { bump, byWeakness, saveHistory, type History } from '../lib/history'

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
  const [prompt, setPrompt] = useState<{ text: string; cls: string }>({
    text: 'Your move.',
    cls: '',
  })
  const [coach, setCoach] = useState('')
  const [awaitNext, setAwaitNext] = useState(false) // teaching moment on screen — no timer, user advances

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
    setAwaitNext(false)
  }

  // missed card returns later in the same deal (005: misses requeue) until clean
  function next(idx: number) {
    const c = cards[idx]
    if (c && c.result === 'bad')
      cards.push({ line: c.line, k: c.k, key: c.key, retry: true, result: null })
    show(idx + 1)
  }

  // after a reveal: the rest of the trap plays itself out so the why is visible
  function step() {
    const d = st.current.drill
    if (!d) return
    if (d.done()) {
      setPrompt({ text: 'That’s the trap. It comes back this deal — get it clean.', cls: 'bad' })
      setAwaitNext(true)
      return
    }
    const e = d.expected()
    if (e.color === d.uc) d.tryMove(e.from, e.to)
    else d.autoMoves()
    syncBoard(cg.current!, d.chess, d.uc, false, [e.from, e.to])
    later(700, step)
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
      beep(true)
      force((n) => n + 1)
      if (!first) {
        // recovered after the reveal — watch the punishment land, then Next
        setPrompt({ text: `✓ ${r.exp.san} — watch why it wins`, cls: 'bad' })
        later(700, step)
      } else if (cmt) {
        // teaching text on screen: no timer, read at your own pace
        setPrompt({ text: `✓ ${r.exp.san}`, cls: c.result })
        setCoach(cmt)
        setAwaitNext(true)
      } else {
        setPrompt({ text: `✓ ${r.exp.san}`, cls: c.result })
        later(900, () => next(ci))
      }
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
    const originals = cards.filter((c) => !c.retry)
    for (const c of originals) bump(history.traps, c.key, c.result === 'bad')
    history.sessions.push({
      mode: 'traps',
      at: new Date().toISOString(),
      cards: originals.length,
      good: originals.filter((c) => c.result === 'good').length,
    })
    saveHistory(history)
    setCi(cards.length)
  }

  useEffect(() => {
    ;(window as any).cmExpected = () =>
      // dev hook, pairs with cmMove
      st.current.drill && !st.current.drill.done() ? st.current.drill.expected() : null
    show(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = ci >= cards.length
  const c = cards[ci]
  const originals = cards.filter((x) => !x.retry)
  const good = originals.filter((x) => x.result === 'good').length
  return (
    <>
      <ModeHead
        title="Trap cards"
        sub="the junk you actually face · one punishing move each · a miss returns this deal"
        onExit={onExit}
      />
      {!done && c && (
        <div className="play">
          <div>
            <div ref={wrap}>
              <Board size={470} onReady={(api) => (cg.current = api)} onMove={onMove} />
            </div>
            <div className="boardfoot">{sanUpto(c.line, c.k)}</div>
          </div>
          <div className="side">
            <div className="dots">
              {cards.map((x, i) => (
                <span
                  key={i}
                  className={'dot' + (x.result ? ' ' + x.result : '') + (i === ci ? ' cur' : '')}
                />
              ))}
            </div>
            <div className="meta">
              <span className="badge">Trap</span> <b>{c.line.name}</b>
              <span>you punish as {c.line.trainAs}</span>
            </div>
            <div className={'feedback ' + prompt.cls}>
              <div className={'prompt ' + prompt.cls}>{prompt.text}</div>
              <div className="coach">{coach}</div>
            </div>
            {awaitNext && (
              <button className="primary" onClick={() => next(ci)}>
                Next →
              </button>
            )}
          </div>
        </div>
      )}
      {done && (
        <div className="scorecard">
          <div className="scoreN">
            {good}/{originals.length}
          </div>
          <div className="sub">
            {good === originals.length
              ? 'clean sweep — they walk into these, you collect'
              : 'missed traps come back first next deal'}
          </div>
          <ul className="misslist">
            {originals.map((x, i) => (
              <li key={i}>
                {x.result === 'good' ? '✓' : '✗'} {x.line.name} — move {Math.floor(x.k / 2) + 1} as{' '}
                {x.line.trainAs}
              </li>
            ))}
          </ul>
          <button className="primary" onClick={onExit}>
            Home
          </button>
        </div>
      )}
    </>
  )
}
