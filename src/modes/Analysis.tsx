import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'
import type { Line } from '../lib/pgn'
import { describeGame, gameParts } from '../lib/sync'
import { Board } from '../components/Board'
import { ModeHead } from '../components/ModeHead'
import { startEngine, type Engine } from '../lib/engine'
import {
  ANALYSIS_V,
  MOVE_MS,
  analyzeGame,
  loadAnalyses,
  loadSparGames,
  saveAnalyses,
  type Analysis as GameAnalysis,
  type AnalysisStore,
  type Blunder,
  type BookInfo,
  type FullGame,
} from '../lib/analyze'
import { computeFacts } from '../lib/facts'
import { coachSay } from '../lib/coach'

const START_FEN = new Chess().fen()

function fmtEval(cp: number): string {
  if (Math.abs(cp) > 9000) return cp > 0 ? '#+' : '#−'
  return (cp > 0 ? '+' : '') + (cp / 100).toFixed(1)
}

function bookSentence(b: BookInfo | null): string {
  if (!b) return 'Never in your repertoire — no line matched from move 1.'
  const mvNo = b.leftAtPly === null ? 0 : Math.floor(b.leftAtPly / 2) + 1
  if (b.leftAtPly === null) return `In book the whole way on “${b.line}”.`
  return b.by === 'me'
    ? `You left “${b.line}” at move ${mvNo} — repertoire wanted ${b.expectedSan}.`
    : `Opponent left “${b.line}” at move ${mvNo} — on your own from there.`
}

// The 017 explanation: facts render instantly, the coach voice swaps in when
// Ollama answers (or never does — facts stand alone by design, ADR 0001).
function CoachNote({ a, bl }: { a: GameAnalysis; bl: Blunder }) {
  const facts = useMemo(
    () =>
      computeFacts({
        fen: bl.fen,
        played: bl.san,
        best: bl.bestSan,
        bestLine: bl.pvSan ?? [],
        punishLine: bl.punishSan ?? [],
        swingCp: bl.swingCp,
      }),
    [bl],
  )
  const [prose, setProse] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(true)
  useEffect(() => {
    let live = true
    setProse(null)
    setWaiting(true)
    const ctx = `In his game (${a.desc}), playing ${a.color === 'w' ? 'White' : 'Black'}, on move ${Math.floor(bl.ply / 2) + 1} he played ${bl.san}; the engine prefers ${bl.bestSan}.`
    coachSay(`${a.uuid}:${bl.ply}`, ctx, facts).then((t) => {
      if (!live) return
      setProse(t)
      setWaiting(false)
    })
    return () => {
      live = false
    }
  }, [a, bl, facts])
  return (
    <div className="panel">
      <b>Coach on {bl.san}</b>
      <div style={{ marginTop: 4 }}>{prose ?? facts.join(' ')}</div>
      <div className="tiny dim" style={{ marginTop: 4 }}>
        {waiting
          ? 'coach voice thinking…'
          : prose
            ? 'coach voice'
            : 'coach voice offline — facts only'}
      </div>
    </div>
  )
}

// The 016 rough take: pick a game, the engine walks it (~70ms/position),
// findings render as summary card + flagged move list + arrows on the board.
export function Analysis({ lines, onExit }: { lines: Line[]; onExit: () => void }) {
  const [games, setGames] = useState<FullGame[]>([])
  const [loaded, setLoaded] = useState(false)
  const [unseen, setUnseen] = useState<Set<string>>(new Set())
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<FullGame | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null)
  const [err, setErr] = useState('')
  const [p, setP] = useState(0) // plies played in the viewed position

  const storeRef = useRef<AnalysisStore>({ games: {} })
  const engRef = useRef<Engine | null>(null)
  const cg = useRef<Api | null>(null)

  useEffect(() => {
    ;(async () => {
      const months: string[] = await (await fetch('/api/data/archives')).json()
      const all: FullGame[] = []
      for (const m of months) {
        const j = await (await fetch('/api/data/archives/' + m)).json()
        all.push(...(j.games ?? []))
      }
      all.push(...(await loadSparGames())) // 014's games review like any other
      const st: { unseen?: string[] } = await fetch('/api/data/sync-state').then((r) =>
        r.ok ? r.json() : {},
      )
      storeRef.current = await loadAnalyses()
      setGames(all.filter((g) => g.rules === 'chess').sort((a, b) => b.end_time - a.end_time))
      setUnseen(new Set(st.unseen ?? []))
      setAnalyzed(new Set(Object.keys(storeRef.current.games)))
      setLoaded(true)
    })().catch(() => setErr('Could not load archives — is npm run dev serving /api/data?'))
    return () => engRef.current?.quit()
  }, [])

  async function markSeen(uuid: string) {
    if (!unseen.has(uuid)) return
    setUnseen((u) => {
      const n = new Set(u)
      n.delete(uuid)
      return n
    })
    // ponytail: read-modify-write can race the sync loop's own PUT; worst case a
    // uuid reappears once and clears on next open
    try {
      const st = await (await fetch('/api/data/sync-state')).json()
      st.unseen = (st.unseen ?? []).filter((x: string) => x !== uuid)
      void fetch('/api/data/sync-state', { method: 'PUT', body: JSON.stringify(st, null, 1) })
    } catch {
      /* next open retries */
    }
  }

  function open(g: FullGame) {
    if (progress) return // one analysis at a time
    setSel(g)
    setErr('')
    const cached = storeRef.current.games[g.uuid]
    if (cached && cached.v === ANALYSIS_V && cached.ms >= MOVE_MS) {
      setAnalysis(cached)
      setP(cached.blunders[0]?.ply ?? 0)
      void markSeen(g.uuid)
      return
    }
    setAnalysis(null)
    setProgress({ done: 0, total: 1 })
    const engine = (engRef.current ??= startEngine())
    analyzeGame(g, lines, engine, (done, total) => setProgress({ done, total }))
      .then((a) => {
        storeRef.current.games[g.uuid] = a
        saveAnalyses(storeRef.current)
        setAnalyzed((s) => new Set(s).add(g.uuid))
        setAnalysis(a)
        setP(a.blunders[0]?.ply ?? 0)
        void markSeen(g.uuid)
      })
      .catch(() => setErr('Analysis failed on this game — engine or PGN hiccup.'))
      .finally(() => setProgress(null))
  }

  const moves = useMemo(() => {
    if (!sel || !analysis) return []
    const c = new Chess()
    c.loadPgn(sel.pgn)
    return c.history({ verbose: true })
  }, [sel, analysis])

  // board follows the viewed ply; flagged next-move draws played-vs-best arrows
  useEffect(() => {
    if (!cg.current || !analysis || !moves.length) return
    const fen = p === 0 ? START_FEN : moves[p - 1].after
    const pos = new Chess(fen)
    const bl = analysis.blunders.find((b) => b.ply === p)
    cg.current.set({
      fen,
      orientation: analysis.color === 'w' ? 'white' : 'black',
      turnColor: pos.turn() === 'w' ? 'white' : 'black',
      check: pos.inCheck(),
      lastMove: p > 0 ? ([moves[p - 1].from, moves[p - 1].to] as Key[]) : undefined,
      movable: { free: false, dests: new Map() },
    })
    cg.current.setAutoShapes(
      bl
        ? [
            { orig: moves[p].from as Key, dest: moves[p].to as Key, brush: 'red' },
            ...(bl.best
              ? [
                  {
                    orig: bl.best.slice(0, 2) as Key,
                    dest: bl.best.slice(2, 4) as Key,
                    brush: 'green',
                  },
                ]
              : []),
          ]
        : [],
    )
  }, [p, analysis, moves])

  useEffect(() => {
    if (!analysis) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setP((x) => Math.max(0, x - 1))
      if (e.key === 'ArrowRight') setP((x) => Math.min(moves.length, x + 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [analysis, moves.length])

  if (err && !sel)
    return (
      <>
        <ModeHead title="Game analysis" onExit={onExit} />
        <div className="analysis">
          <div className="bad">{err}</div>
        </div>
      </>
    )

  // ---- game list ----
  if (!sel)
    return (
      <>
        <ModeHead
          title="Game analysis"
          sub={`${games.length} games — your archives and your sparring · pick one, the engine flags the damage`}
          onExit={onExit}
          right={unseen.size > 0 ? <span className="badge">{unseen.size} new</span> : undefined}
        />
        <div className="analysis">
          {!loaded && <div className="dim">loading archives…</div>}
          <div className="gamelist">
            {games.map((g) => {
              const { meWhite, opp, cls, mark } = gameParts(g)
              return (
                <button key={g.uuid} className="gamerow" onClick={() => open(g)}>
                  <span className="when">
                    {new Date(g.end_time * 1000).toLocaleDateString()}
                  </span>
                  <span className={'score ' + cls}>{mark}</span>
                  <span className="opp">
                    {meWhite ? '○' : '●'} {opp}
                  </span>
                  <span className="tc">{g.time_class}</span>
                  {unseen.has(g.uuid) && <span className="badge">new</span>}
                  {analyzed.has(g.uuid) && <span className="badge gold">✓ analyzed</span>}
                </button>
              )
            })}
          </div>
        </div>
      </>
    )

  // ---- one game ----
  const flagOf = (j: number) => analysis?.blunders.find((b) => b.ply === j)
  const blCur = flagOf(p)
  const blunderCount = analysis?.blunders.filter((b) => b.severity === 'blunder').length ?? 0
  const mistakeCount = (analysis?.blunders.length ?? 0) - blunderCount
  return (
    <>
      <ModeHead title="Game analysis" onExit={onExit} />
      <div className="analysis">
        <div className="meta">
          <button onClick={() => (setSel(null), setAnalysis(null))}>← games</button>
          <b>{analysis?.desc ?? describeGame(sel)}</b>
          <span className="dim">{new Date(sel.end_time * 1000).toLocaleDateString()}</span>
        </div>
        {progress && (
          <div className="card">
            <div className="sub">
              analyzing… {progress.done}/{progress.total} positions
            </div>
            <div className="progress">
              <div style={{ width: `${(100 * progress.done) / progress.total}%` }} />
            </div>
          </div>
        )}
        {err && <div className="bad">{err}</div>}
        {analysis && (
          <div className="play">
            <div>
              <Board size={470} onReady={(api) => (cg.current = api)} onMove={() => {}} />
              <div className="boardfoot">
                <b>eval {fmtEval(analysis.evals[p] ?? 0)}</b>
                <span>← → or click a move</span>
              </div>
            </div>
            <div className="side">
              <div className="panel">
                <div
                  className={analysis.book?.by === 'me' ? 'bl bad' : 'bl'}
                  onClick={() => analysis.book?.leftAtPly != null && setP(analysis.book.leftAtPly)}
                >
                  {bookSentence(analysis.book)}
                </div>
                <div className="sub" style={{ marginTop: 6 }}>
                  {analysis.blunders.length === 0
                    ? 'No swings flagged — clean game at this depth.'
                    : `${blunderCount} blunder${blunderCount === 1 ? '' : 's'} · ${mistakeCount} mistake${mistakeCount === 1 ? '' : 's'} — click to jump:`}
                </div>
                <ul className="misslist">
                  {analysis.blunders.map((b) => (
                    <li key={b.ply} className="bl" onClick={() => setP(b.ply)}>
                      move {Math.floor(b.ply / 2) + 1}: {b.san}
                      {b.severity === 'blunder' ? '??' : '?'} — better {b.bestSan} (−
                      {(b.swingCp / 100).toFixed(1)})
                      {b.pvSan.length > 1 && (
                        <span className="dim"> because {b.pvSan.join(' ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {blCur && <CoachNote a={analysis} bl={blCur} />}
              <div className="panel movelist">
                {moves.map((m, j) => {
                  const f = flagOf(j)
                  return (
                    <span
                      key={j}
                      className={
                        'mv' +
                        (j + 1 === p ? ' cur' : '') +
                        (f ? (f.severity === 'blunder' ? ' blunder' : ' mistake') : '')
                      }
                      onClick={() => setP(f ? j : j + 1)}
                    >
                      {m.color === 'w' ? `${j / 2 + 1}.` : ''}
                      {m.san}
                      {f ? (f.severity === 'blunder' ? '??' : '?') : ''}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
