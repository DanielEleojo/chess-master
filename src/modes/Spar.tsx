import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Api } from 'chessground/api'
import { Board, syncBoard } from '../components/Board'
import { startEngine, type Engine } from '../lib/engine'
import { beep } from '../lib/fx'
import { sanUpto } from '../lib/drill'
import type { Line } from '../lib/pgn'

// Sparring — ticket 014's ROUGH TAKE, built to be reacted to, not to be right.
// Every number below is the open question: how many rungs, named how, varying what.
//
// ponytail: strength is (Skill Level, nodes) only. Stockfish's Skill Level already
// randomises its own pick, so 002's MultiPV softmax buys nothing — add it only if a
// rung plays robotically. No clock either: elapsed counts up, nothing flags.
export const RUNGS = [
  // measured: even 1 node defends scholar's mate — Stockfish's move ordering alone
  // plays sensibly, so this floor may still be too high. If it is, the fix is
  // randomising among the top few moves (002's MultiPV softmax) — not a smaller cap.
  { name: 'Careless', skill: 0, nodes: 1, blurb: 'no thought at all — the floor' },
  { name: 'Rookie', skill: 0, nodes: 40, blurb: 'one move ahead, walks into your threats' },
  { name: 'Beginner', skill: 0, nodes: 400, blurb: 'takes what you leave hanging, no plan' },
  { name: 'Improver', skill: 3, nodes: 4000, blurb: 'punishes loose pieces, spots short tactics' },
  { name: 'Club player', skill: 6, nodes: 40000, blurb: 'you need a real idea to beat this' },
]

const mmss = (ms: number) =>
  Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0')

export function Spar({ lines, onExit }: { lines: Line[]; onExit: () => void }) {
  const [rung, setRung] = useState(1)
  const [pick, setPick] = useState<'w' | 'b' | 'r'>('w')
  const [lineIdx, setLineIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [, force] = useState(0)

  const cg = useRef<Api | null>(null)
  const engRef = useRef<Engine | null>(null)
  const rungRef = useRef(rung)
  rungRef.current = rung
  const st = useRef({
    chess: new Chess(),
    my: 'w' as 'w' | 'b',
    lm: null as [string, string] | null,
    over: '',
    thinking: false,
    id: 0, // bumped per game — a late bestmove from the previous game is dropped
    clock: { w: 0, b: 0 },
    since: 0,
    book: '',
  })

  const repaint = () => {
    const s = st.current
    syncBoard(cg.current!, s.chess, s.my, !s.over && !s.thinking && s.chess.turn() === s.my, s.lm)
    force((n) => n + 1)
  }

  // charge the side that just moved
  function bill() {
    const s = st.current
    const now = Date.now()
    s.clock[s.chess.turn() === 'w' ? 'b' : 'w'] += now - s.since
    s.since = now
  }

  function finished() {
    const s = st.current
    const c = s.chess
    if (!c.isGameOver()) return false
    s.over = c.isCheckmate()
      ? c.turn() === s.my
        ? 'Checkmate — it got you.'
        : 'Checkmate. You won.'
      : c.isStalemate()
        ? 'Stalemate — draw.'
        : 'Draw.'
    return true
  }

  async function engineMove(id: number) {
    const s = st.current
    s.thinking = true
    repaint()
    const eng = (engRef.current ??= startEngine())
    const r = RUNGS[rungRef.current]
    const uci = await eng.playFen(s.chess.fen(), r.skill, r.nodes)
    if (id !== s.id) return
    s.thinking = false
    if (uci) {
      // ponytail: auto-queen, same as the drill — underpromotion never comes up here
      const mv = s.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
      bill()
      s.lm = [mv.from, mv.to]
      beep(false)
    }
    finished()
    repaint()
  }

  function onMove(from: string, to: string) {
    const s = st.current
    if (s.over || s.thinking || s.chess.turn() !== s.my) return
    let mv
    try {
      mv = s.chess.move({ from, to, promotion: 'q' })
    } catch {
      return repaint()
    }
    bill()
    s.lm = [mv.from, mv.to]
    beep(true)
    if (finished()) return repaint()
    void engineMove(s.id)
  }

  // start the game once the board exists (child effects run before this one)
  useEffect(() => {
    if (!playing) return
    const s = st.current
    const line = lineIdx >= 0 ? lines[lineIdx] : null
    s.id++
    s.my = line ? (line.trainAs === 'White' ? 'w' : 'b') : pick === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pick
    s.chess = new Chess()
    for (const m of line?.moves ?? []) s.chess.move(m.san)
    const last = line?.moves[line.moves.length - 1]
    s.lm = last ? [last.from, last.to] : null
    s.book = line ? `${line.name} — ${sanUpto(line, line.moves.length)}` : ''
    s.over = ''
    s.thinking = false
    s.clock = { w: 0, b: 0 }
    s.since = Date.now()
    cg.current!.set({ orientation: s.my === 'w' ? 'white' : 'black' })
    ;(window as any).cmSpar = () => ({ fen: s.chess.fen(), over: s.over, thinking: s.thinking }) // dev hook
    repaint()
    if (s.chess.turn() !== s.my) void engineMove(s.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [playing])

  useEffect(() => () => engRef.current?.quit(), [])

  if (!playing)
    return (
      <div className="cards">
        <div className="card cardface" style={{ maxWidth: 560, textAlign: 'left' }}>
          <h2>Sparring</h2>
          <div className="sub">
            Rough take (ticket 014) — play a few, then tell me which rungs are worth keeping.
          </div>
          <div className="panel" style={{ marginTop: 14 }}>
            <b>How strong?</b>
            {RUNGS.map((r, i) => (
              <button
                key={r.name}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 6 }}
                onClick={() => setRung(i)}
              >
                {i === rung ? '● ' : '○ '}
                <b>{r.name}</b> — {r.blurb}{' '}
                <span className="tiny dim">
                  (skill {r.skill} · {r.nodes} nodes)
                </span>
              </button>
            ))}
          </div>
          <div className="panel" style={{ marginTop: 12 }}>
            <b>Start from</b>
            <select
              style={{ display: 'block', width: '100%', marginTop: 6 }}
              value={lineIdx}
              onChange={(e) => setLineIdx(+e.target.value)}
            >
              <option value={-1}>Fresh game</option>
              {lines.map((l) => (
                <option key={l.idx} value={l.idx}>
                  {l.system}: {l.name} (you are {l.trainAs})
                </option>
              ))}
            </select>
            {lineIdx < 0 ? (
              <div style={{ marginTop: 8 }}>
                {(['w', 'b', 'r'] as const).map((c) => (
                  <button key={c} onClick={() => setPick(c)}>
                    {c === pick ? '● ' : '○ '}
                    {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="tiny dim" style={{ marginTop: 8 }}>
                the line gets played out first — you spar on from where the book ends
              </div>
            )}
          </div>
          <div className="tiny dim" style={{ marginTop: 12 }}>
            If even the bottom rung beats you every time, say so — the fix is making it
            pick randomly among its top moves, not thinking less.
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setPlaying(true)}>Play</button> <button onClick={onExit}>Home</button>
          </div>
        </div>
      </div>
    )

  const s = st.current
  const live = !s.over
  const running = live ? Date.now() - s.since : 0
  const el = { w: s.clock.w, b: s.clock.b }
  if (live) el[s.chess.turn()] += running
  const hist = s.chess.history()
  return (
    <div className="drill">
      <div>
        <Board size={470} onReady={(api) => (cg.current = api)} onMove={onMove} />
        <div className="linetag">
          <span className="badge">{RUNGS[rung].name}</span>{' '}
          <span className="badge">you are {s.my === 'w' ? 'White' : 'Black'}</span>{' '}
          {s.book && <span className="tiny dim">from {s.book}</span>}
        </div>
        <div className={'prompt ' + (s.over ? (s.over.includes('You won') ? 'good' : 'bad') : '')}>
          {s.over || (s.thinking ? 'thinking…' : 'Your move.')}
        </div>
      </div>
      <div className="side">
        <div className="panel">
          <b>Strength</b>
          <select
            style={{ display: 'block', width: '100%', marginTop: 6 }}
            value={rung}
            onChange={(e) => setRung(+e.target.value)}
          >
            {RUNGS.map((r, i) => (
              <option key={r.name} value={i}>
                {r.name} (skill {r.skill} · {r.nodes}n)
              </option>
            ))}
          </select>
          <div className="tiny dim" style={{ marginTop: 6 }}>
            switchable mid-game on purpose — find where it stops being fun
          </div>
        </div>
        <div className="panel">
          <b>Elapsed</b>
          <div>
            you {mmss(el[s.my])} · engine {mmss(el[s.my === 'w' ? 'b' : 'w'])}
          </div>
          <div className="tiny dim">no clock, nothing flags — say if you want one</div>
        </div>
        <div className="panel">
          <div className="movelist">
            {hist.map((m, i) => (
              <span key={i} className="mv">
                {i % 2 === 0 && <span className="dim">{i / 2 + 1}.</span>} {m}
              </span>
            ))}
          </div>
        </div>
        {live && (
          <button onClick={() => ((s.over = 'You resigned.'), repaint())}>Resign</button>
        )}
        <button onClick={() => setPlaying(false)}>New game</button>
        <button onClick={onExit}>Home</button>
      </div>
    </div>
  )
}
