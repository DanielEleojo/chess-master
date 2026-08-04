import { useEffect, useRef, useState } from 'react'
import type { Api } from 'chessground/api'
import { makeDrill, type Drill } from '../lib/drill'
import { Board, syncBoard } from '../components/Board'
import { ModeHead } from '../components/ModeHead'
import { beep, shake, useLater } from '../lib/fx'
import { bump, saveHistory, type History } from '../lib/history'
import { dealCards, type PCard } from '../lib/puzzles'

type Dealt = PCard & { result: 'good' | 'bad' | null }

// 025: the served band ratchets up like Spar's rung ladder — two strong deals
// (≥80% first-try, own-mistake cards included) at a floor retires it for good.
// A weak deal doesn't reset the count, same as Spar not undoing wins on a loss.
export const FLOORS = [600, 850, 1100, 1350, 1600]
export const STRONG_HITRATE = 0.8
export const DEALS_TO_CLIMB = 2

function floorIdx(): number {
  return Math.min(FLOORS.length - 1, Math.max(0, +(localStorage.getItem('cm.puzzleFloor') ?? 0) || 0))
}

// Called once a deal finishes; ownOnly deals (no band puzzles at all) don't count.
function ratchet(hitRate: number): void {
  if (hitRate < STRONG_HITRATE) return
  const idx = floorIdx()
  if (idx >= FLOORS.length - 1) return // top rung — nothing above it
  const strong = (+(localStorage.getItem('cm.puzzleStrong') ?? 0) || 0) + 1
  if (strong < DEALS_TO_CLIMB) {
    localStorage.setItem('cm.puzzleStrong', String(strong))
    return
  }
  localStorage.setItem('cm.puzzleFloor', String(idx + 1))
  localStorage.setItem('cm.puzzleStrong', '0')
}

// Tactics (ticket 013). Same card sprint as the trap deck, but a card can run
// two moves: solve, the opponent answers, solve again. `ownOnly` is the coach's
// blunder-cluster deep link — deal his own mistakes back and nothing else.
export function Puzzles({
  lichess,
  own,
  history,
  ownOnly,
  onExit,
}: {
  lichess: PCard[]
  own: PCard[]
  history: History
  ownOnly?: boolean
  onExit: () => void
}) {
  const [floor] = useState(() => FLOORS[floorIdx()])
  const [strong] = useState(() => +(localStorage.getItem('cm.puzzleStrong') ?? 0) || 0)
  const [cards] = useState<Dealt[]>(() =>
    dealCards(
      lichess.filter((c) => c.rating === undefined || c.rating >= floor),
      own,
      history,
      ownOnly,
    ).map((c) => ({ ...c, result: null })),
  )
  const [ci, setCi] = useState(0)
  const [, force] = useState(0) // dots repaint after result mutation
  const [prompt, setPrompt] = useState<{ text: string; cls: string }>({
    text: 'Your move.',
    cls: '',
  })
  const [coach, setCoach] = useState('')
  const [awaitNext, setAwaitNext] = useState(false)

  const cg = useRef<Api | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const st = useRef({ drill: null as Drill | null, lm: null as [string, string] | null })
  const later = useLater()

  function show(idx: number) {
    if (idx >= cards.length) return finish()
    const c = cards[idx]
    const d = makeDrill(c.line, c.start)
    st.current.drill = d
    cg.current!.setAutoShapes([])
    cg.current!.set({ orientation: c.line.trainAs === 'White' ? 'white' : 'black' })
    // the move that walked into it, highlighted — the position lands with context
    const prev = c.start > 0 ? c.line.moves[c.start - 1] : null
    st.current.lm = prev ? [prev.from, prev.to] : null
    syncBoard(cg.current!, d.chess, d.uc, true, st.current.lm)
    setCi(idx)
    setPrompt({
      text: c.own ? 'You played something else here. Find the move.' : 'Your move.',
      cls: '',
    })
    setCoach('')
    setAwaitNext(false)
  }

  // missed card returns later in the same deal (005: misses requeue)
  function next(idx: number) {
    const c = cards[idx]
    if (c && c.result === 'bad') cards.push({ ...c, retry: true, result: null })
    show(idx + 1)
  }

  function solved(idx: number) {
    const c = cards[idx]
    st.current.drill = null
    if (c.result === 'good') {
      setPrompt({ text: '✓ solved', cls: 'good' })
      later(800, () => next(idx))
    } else {
      setPrompt({ text: 'That’s it — the card comes back this deal.', cls: 'bad' })
      setAwaitNext(true)
    }
  }

  function onMove(from: string, to: string) {
    const d = st.current.drill
    if (!d || d.done()) return
    const c = cards[ci]
    const r = d.tryMove(from, to)
    if (!r.ok) {
      c.result = 'bad' // any miss in a multi-move card sinks the whole card
      setPrompt({
        text: `✗ ${r.got ? r.got.san : 'illegal'} — it's ${r.exp.san}. Play it to continue.`,
        cls: 'bad',
      })
      setCoach(c.why)
      beep(false)
      shake(wrap.current)
      force((n) => n + 1)
      syncBoard(cg.current!, d.chess, d.uc, true, st.current.lm)
      cg.current!.setAutoShapes([{ orig: r.exp.from, dest: r.exp.to, brush: 'green' }])
      return
    }
    c.result ??= 'good'
    cg.current!.setAutoShapes([])
    syncBoard(cg.current!, d.chess, d.uc, false, [r.got!.from, r.got!.to])
    beep(true)
    force((n) => n + 1)
    if (d.done()) return solved(ci)
    // multi-move card: the opponent answers, then he has to find the follow-up
    setPrompt({ text: `✓ ${r.exp.san}`, cls: c.result })
    later(600, () => {
      const opp = d.autoMoves()
      const last = opp[opp.length - 1]
      st.current.lm = last ? [last.from, last.to] : st.current.lm
      syncBoard(cg.current!, d.chess, d.uc, !d.done(), st.current.lm)
      if (d.done()) solved(ci)
      else setPrompt({ text: `${last?.san ?? ''} — and now?`, cls: '' })
    })
  }

  function finish() {
    st.current.drill = null
    const originals = cards.filter((c) => !c.retry)
    for (const c of originals) bump(history.puzzles, c.key, c.result === 'bad')
    const good = originals.filter((c) => c.result === 'good').length
    history.sessions.push({
      mode: 'puzzles',
      at: new Date().toISOString(),
      cards: originals.length,
      good,
    })
    saveHistory(history)
    if (!ownOnly && originals.length) ratchet(good / originals.length)
    setCi(cards.length)
  }

  useEffect(() => {
    ;(window as any).cmExpected = () =>
      // dev hook, pairs with cmMove
      st.current.drill && !st.current.drill.done() ? st.current.drill.expected() : null
    if (cards.length) show(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!cards.length)
    return (
      <>
        <ModeHead title="Tactics" onExit={onExit} />
        <div className="scorecard">
          <h2>No cards yet</h2>
          <div className="sub">
            Run <code>python3 scripts/build-puzzles.py</code> to build the deck, or analyze a game
            to get your own mistakes dealt back.
          </div>
        </div>
      </>
    )

  const done = ci >= cards.length
  const c = cards[ci]
  const originals = cards.filter((x) => !x.retry)
  const good = originals.filter((x) => x.result === 'good').length
  return (
    <>
      <ModeHead
        title="Tactics"
        sub={
          ownOnly
            ? 'your own flagged positions — the move you missed, second chance'
            : 'your mistakes and your openings’ tactics · miss = see the shot, it returns this deal'
        }
        onExit={onExit}
        right={
          !ownOnly && (
            <span className="badge gold">
              {floor}+ · {strong}/{DEALS_TO_CLIMB}
            </span>
          )
        }
      />
      {!done && c && (
        <div className="play">
          <div>
            <div ref={wrap}>
              <Board size={470} onReady={(api) => (cg.current = api)} onMove={onMove} />
            </div>
            <div className="boardfoot">{c.line.trainAs} to play</div>
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
              {/* his own flagged positions get the annotator's red, not brass —
                  brass is for what he earned, and this card came from a miss */}
              <span className={'badge' + (c.own ? ' bad' : '')}>{c.label}</span>
              <span>{c.sub}</span>
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
              ? 'clean deal — that’s the pattern sticking'
              : 'missed cards come back first next deal'}
          </div>
          <ul className="misslist">
            {originals.map((x, i) => (
              <li key={i}>
                {x.result === 'good' ? '✓' : '✗'} {x.label} — {x.sub}
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
