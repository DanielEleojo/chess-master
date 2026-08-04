import { useEffect, useRef, useState } from 'react'
import { Chess, type Move } from 'chess.js'
import type { Api } from 'chessground/api'
import type { Line } from '../lib/pgn'
import { makeDrill, type Drill } from '../lib/drill'
import { Board, syncBoard } from '../components/Board'
import { beep, shake, useLater } from '../lib/fx'
import { loadExt, saveExt, tailGrace, type ExtStore } from '../lib/extend'
import { bump, byWeakness, saveHistory, type History } from '../lib/history'
import { startEngine, type Engine } from '../lib/engine'
import { computeFacts, sanLine } from '../lib/facts'
import { coachSay } from '../lib/coach'

// "why not my move?" (017) — never automatic, the engine only runs on click
const WHY_MS = 500 // engine time per side of the tried-vs-line comparison
type Why = null | 'offer' | 'busy' | { text: string; tag: string }
interface WhyCtx {
  fen: string // position before the miss
  tried: Move
  exp: Move
  name: string
  as: 'White' | 'Black'
  cmt: string | undefined // the line's why-comment for the expected move
}

const PIECE: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

// The blended drill (ticket 005): B's shape — endless lines, streak, misses requeue
// two slots later, end whenever — with C's feedback on a miss: explain why (PGN
// comment or piece hint) and retry; the arrow only appears on the second miss.
// Cold start on new lines (ticket 012 unresolved -> default: misses teach).
export function LineDrill({
  lines,
  history,
  focus,
  onExit,
}: {
  lines: Line[]
  history: History
  focus?: string // coach deep-link (018): deal this line first
  onExit: () => void
}) {
  const [cur, setCur] = useState<Line | null>(null)
  const [missedBadge, setMissedBadge] = useState(false)
  const [prompt, setPrompt] = useState<{ text: string; cls: string }>({ text: '', cls: '' })
  const [coach, setCoach] = useState('')
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(0)
  const [totals, setTotals] = useState({ linesDone: 0, ok: 0, tries: 0 })
  const [nextUp, setNextUp] = useState<{ name: string; missed: boolean }[]>([])
  const [over, setOver] = useState(false)
  const [why, setWhy] = useState<Why>(null)
  const whyCtx = useRef<WhyCtx | null>(null)
  const engRef = useRef<Engine | null>(null)
  const extRef = useRef<ExtStore | null>(null)

  const cg = useRef<Api | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const st = useRef({
    queue: [] as number[],
    drill: null as Drill | null,
    curIdx: -1,
    attempts: 0,
    lm: null as [string, string] | null,
    missedThisLine: false,
    minMissPly: Infinity, // lowest ply missed this pass — tail grace (019) needs it
    missedNames: new Set<string>(),
    ok: 0,
    tries: 0,
    linesDone: 0,
    streak: 0,
    best: 0,
  })
  const later = useLater()

  const paint = () => {
    const s = st.current
    setStreak(s.streak)
    setBest(s.best)
    setTotals({ linesDone: s.linesDone, ok: s.ok, tries: s.tries })
    setNextUp(
      s.queue.slice(0, 3).map((i) => ({
        name: lines[i].name,
        missed: s.missedNames.has(lines[i].name),
      })),
    )
  }

  function nextLine() {
    const s = st.current
    if (!s.queue.length) {
      s.queue = byWeakness(lines, (l) => l.name, history.lines).map((l) => l.idx)
      const f = focus ? lines.find((l) => l.name === focus)?.idx : undefined
      if (f !== undefined) s.queue = [f, ...s.queue.filter((i) => i !== f)]
    }
    s.curIdx = s.queue.shift()!
    const line = lines[s.curIdx]
    s.drill = makeDrill(line)
    s.lm = null
    s.attempts = 0
    s.missedThisLine = false
    s.minMissPly = Infinity
    cg.current!.setAutoShapes([])
    cg.current!.set({ orientation: line.trainAs === 'White' ? 'white' : 'black' })
    setCur(line)
    setMissedBadge(st.current.missedNames.has(line.name))
    setPrompt({ text: '', cls: '' })
    setCoach('')
    whyCtx.current = null
    setWhy(null)
    paint()
    handOver()
  }

  async function explainMiss() {
    const w = whyCtx.current
    if (!w) return
    setWhy('busy')
    const eng = (engRef.current ??= startEngine())
    const cA = new Chess(w.fen)
    cA.move(w.tried.san)
    const cB = new Chess(w.fen)
    cB.move(w.exp.san)
    const [a, b] = await Promise.all([eng.evalFen(cA.fen(), WHY_MS), eng.evalFen(cB.fen(), WHY_MS)])
    if (whyCtx.current !== w) return // a new miss (or a hit) superseded this one
    // scores come from the opponent's side after each move; my swing = a.cp − b.cp
    const swing = a.cp - b.cp
    let facts = computeFacts({
      fen: w.fen,
      played: w.tried.san,
      best: w.exp.san,
      bestLine: [w.exp.san, ...sanLine(cB.fen(), b.pv, 4)],
      punishLine: sanLine(cA.fen(), a.pv, 5),
      swingCp: Math.max(0, swing),
    })
    // shallow engine often shrugs at repertoire deviations — then the honest
    // answer is discipline, not tactics
    if (swing < 30)
      facts = [
        `${w.tried.san} isn't losing by the engine — but drilling means one answer: ${w.exp.san}.${w.cmt ? ' ' + w.cmt : ''}`,
      ]
    setWhy({ text: facts.join(' '), tag: 'coach voice thinking…' })
    const ctx = `While drilling the repertoire line "${w.name}" as ${w.as}, he tried ${w.tried.san}; the repertoire move is ${w.exp.san}.${w.cmt ? ` The line's note on ${w.exp.san}: "${w.cmt}"` : ''}`
    const prose = await coachSay(`drill:${w.fen}:${w.tried.san}`, ctx, facts)
    if (whyCtx.current !== w) return
    if (prose) setWhy({ text: prose, tag: 'coach voice' })
    else setWhy({ text: facts.join(' '), tag: 'coach voice offline — facts only' })
  }

  function handOver() {
    const s = st.current
    const autos = s.drill!.autoMoves()
    if (autos.length) {
      const a = autos[autos.length - 1]
      s.lm = [a.from, a.to]
    }
    syncBoard(cg.current!, s.drill!.chess, s.drill!.uc, !s.drill!.done(), s.lm)
    if (s.drill!.done()) later(500, lineDone)
  }

  function lineDone() {
    const s = st.current
    s.linesDone++
    const line = lines[s.curIdx]
    let missed = s.missedThisLine
    // 019: freshly-extended plies are a cold start — the first miss landing
    // beyond the pre-extension length goes unrecorded (teaching/requeue unchanged)
    if (missed && extRef.current && tailGrace(extRef.current, line.name, s.minMissPly)) {
      missed = false
      saveExt(extRef.current)
    }
    bump(history.lines, line.name, missed)
    saveHistory(history)
    setPrompt({ text: 'Line complete ✓', cls: 'good' })
    paint()
    later(650, nextLine)
  }

  function onMove(from: string, to: string) {
    const s = st.current
    if (!s.drill || s.drill.done()) return
    s.tries++
    const line = lines[s.curIdx]
    const r = s.drill.tryMove(from, to)
    if (r.ok) {
      s.ok++
      s.attempts = 0
      s.streak++
      s.best = Math.max(s.best, s.streak)
      s.lm = [r.got!.from, r.got!.to]
      cg.current!.setAutoShapes([])
      syncBoard(cg.current!, s.drill.chess, s.drill.uc, false, s.lm)
      beep(true)
      const cmt = line.comments[r.exp.after]
      setCoach(cmt ? `✓ ${r.exp.san} — ${cmt}` : '')
      setPrompt({ text: '', cls: '' })
      whyCtx.current = null
      setWhy(null)
      if (s.drill.done()) later(450, lineDone)
      else later(350, handOver)
    } else {
      s.attempts++
      s.streak = 0
      s.minMissPly = Math.min(s.minMissPly, s.drill.i)
      beep(false)
      shake(wrap.current)
      if (!s.missedThisLine && !s.queue.includes(s.curIdx)) s.queue.splice(2, 0, s.curIdx)
      s.missedThisLine = true
      s.missedNames.add(line.name)
      const got = r.got ? r.got.san : 'that'
      const cmt = line.comments[r.exp.after]
      if (r.got) {
        whyCtx.current = {
          fen: s.drill.chess.fen(), // tryMove undid the miss — this is the before-position
          tried: r.got,
          exp: r.exp,
          name: line.name,
          as: line.trainAs,
          cmt,
        }
        setWhy('offer')
      }
      if (s.attempts === 1) {
        setCoach(
          cmt
            ? `Not ${got}. Remember: ${cmt}`
            : `Not ${got}. Hint: it's a ${PIECE[r.exp.piece]} move — think about what the ${line.system} wants here.`,
        )
        setPrompt({ text: '✗ streak reset — try again', cls: 'bad' })
      } else {
        cg.current!.setAutoShapes([{ orig: r.exp.from, dest: r.exp.to, brush: 'green' }])
        setCoach(cmt ? `It's ${r.exp.san} — ${cmt}` : `It's ${r.exp.san}. Play it to continue.`)
        setPrompt({ text: '✗ this line comes back soon', cls: 'bad' })
      }
      syncBoard(cg.current!, s.drill.chess, s.drill.uc, true, s.lm)
    }
    paint()
  }

  function endSession() {
    const s = st.current
    history.sessions.push({
      mode: 'lines',
      at: new Date().toISOString(),
      lines: s.linesDone,
      moves: s.tries,
      ok: s.ok,
      bestStreak: s.best,
    })
    saveHistory(history)
    setOver(true)
  }

  useEffect(() => {
    ;(window as any).cmExpected = () => // dev hook, pairs with cmMove
      st.current.drill && !st.current.drill.done() ? st.current.drill.expected() : null
    void loadExt().then((e) => (extRef.current = e))
    nextLine()
    return () => engRef.current?.quit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const acc = totals.tries ? Math.round((totals.ok / totals.tries) * 100) : 100
  return (
    <div className="drill">
      <div>
        <div ref={wrap}>
          <Board size={470} onReady={(api) => (cg.current = api)} onMove={onMove} />
        </div>
        <div className="linetag">
          {cur && (
            <>
              <b>{cur.name}</b> <span className="badge">{cur.system}</span>{' '}
              <span className="badge">you are {cur.trainAs}</span>
              {missedBadge && <span className="badge bad"> back for revenge</span>}
            </>
          )}
        </div>
        <div className={'prompt ' + prompt.cls}>{prompt.text}</div>
        <div className="coach">{coach}</div>
        {why === 'offer' && (
          <button className="tiny" onClick={explainMiss}>
            why not my move?
          </button>
        )}
        {why === 'busy' && <div className="tiny dim">engine checking your move…</div>}
        {why !== null && typeof why === 'object' && (
          <div className="panel" style={{ marginTop: 6 }}>
            {why.text}
            <div className="tiny dim" style={{ marginTop: 4 }}>{why.tag}</div>
          </div>
        )}
      </div>
      <div className="side">
        <div className="streakbox">
          <div key={streak} className="streakN pulse">
            {streak}
          </div>
          <div className="dim">streak</div>
          <div className="dim">best {best}</div>
        </div>
        <div className="panel">
          <b>Up next</b>
          <ol>
            {nextUp.map((n, i) => (
              <li key={i}>
                {n.name}
                {n.missed && (
                  <>
                    {' '}
                    <span className="badge bad">missed</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="panel dim">
          {totals.linesDone} lines · {totals.ok}/{totals.tries} moves · {acc}% accuracy
        </div>
        <button onClick={endSession}>End session</button>
        <button onClick={onExit}>Home</button>
      </div>
      {over && (
        <div className="overlay">
          <div className="card">
            <h2>Session over</h2>
            <p>
              {totals.linesDone} lines · {totals.ok}/{totals.tries} moves · best streak{' '}
              <b style={{ color: 'var(--gold)' }}>{best}</b>
            </p>
            <p className="dim">
              {st.current.missedNames.size
                ? 'Missed: ' + [...st.current.missedNames].join(', ')
                : 'Nothing missed. Machine.'}
            </p>
            <button onClick={onExit}>Home</button>
          </div>
        </div>
      )}
    </div>
  )
}
