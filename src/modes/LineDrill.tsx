import { useEffect, useRef, useState } from 'react'
import type { Api } from 'chessground/api'
import type { Line } from '../lib/pgn'
import { makeDrill, type Drill } from '../lib/drill'
import { Board, syncBoard } from '../components/Board'
import { beep, shake, useLater } from '../lib/fx'
import { bump, byWeakness, saveHistory, type History } from '../lib/history'

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
  onExit,
}: {
  lines: Line[]
  history: History
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

  const cg = useRef<Api | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const st = useRef({
    queue: [] as number[],
    drill: null as Drill | null,
    curIdx: -1,
    attempts: 0,
    lm: null as [string, string] | null,
    missedThisLine: false,
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
    if (!s.queue.length) s.queue = byWeakness(lines, (l) => l.name, history.lines).map((l) => l.idx)
    s.curIdx = s.queue.shift()!
    const line = lines[s.curIdx]
    s.drill = makeDrill(line)
    s.lm = null
    s.attempts = 0
    s.missedThisLine = false
    cg.current!.setAutoShapes([])
    cg.current!.set({ orientation: line.trainAs === 'White' ? 'white' : 'black' })
    setCur(line)
    setMissedBadge(st.current.missedNames.has(line.name))
    setPrompt({ text: '', cls: '' })
    setCoach('')
    paint()
    handOver()
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
    bump(history.lines, line.name, s.missedThisLine)
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
      if (s.drill.done()) later(450, lineDone)
      else later(350, handOver)
    } else {
      s.attempts++
      s.streak = 0
      beep(false)
      shake(wrap.current)
      if (!s.missedThisLine && !s.queue.includes(s.curIdx)) s.queue.splice(2, 0, s.curIdx)
      s.missedThisLine = true
      s.missedNames.add(line.name)
      const got = r.got ? r.got.san : 'that'
      const cmt = line.comments[r.exp.after]
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
    nextLine()
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
