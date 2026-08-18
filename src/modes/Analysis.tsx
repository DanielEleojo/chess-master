import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Move } from 'chess.js'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'
import type { Line } from '../lib/pgn'
import { describeGame, gameParts } from '../lib/sync'
import { Board, destsOf } from '../components/Board'
import { ModeHead } from '../components/ModeHead'
import { startEngine, type Engine } from '../lib/engine'
import {
  ANALYSIS_V,
  MOVE_MS,
  analyzeGame,
  loadAnalyses,
  loadSparGames,
  saveAnalyses,
  winPct,
  type Analysis as GameAnalysis,
  type AnalysisStore,
  type Blunder,
  type BookInfo,
  type FullGame,
  type Tag,
} from '../lib/analyze'
import { loadOpenings, type Openings } from '../lib/openings'
import { computeFacts, sanLine } from '../lib/facts'
import { coachSay } from '../lib/coach'

const START_FEN = new Chess().fen()
// "why not my move?" (LineDrill) — same latency budget for a live what-if eval
const WHY_MS = 500
const RETRY_CP = 50 // retry succeeds on the engine move or anything within this
const GENERIC_FALLBACK = 'Nothing hangs — the cost is positional'
type WhatIf = null | 'busy' | { text: string; tag: string }
type Retry = null | 'busy' | { ok: boolean; text: string }

// chess.com's badge language (035): their colors, their glyphs. TS-side map
// because SVG badges and graph dots can't read CSS vars.
const CC: Record<Tag, string> = {
  brilliant: '#26c2a3',
  great: '#749bbf',
  best: '#81b64c',
  excellent: '#81b64c',
  good: '#95b776',
  book: '#d5a47d',
  inaccuracy: '#f7c631',
  mistake: '#ffa459',
  miss: '#ff7769',
  blunder: '#fa412d',
}
const GLYPH: Partial<Record<Tag, string>> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  book: '≡',
  inaccuracy: '?!',
  mistake: '?',
  miss: '✗',
  blunder: '??',
}
const TAGS: Tag[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']
// the graph marks the dramatic moves only
const DOTS: Tag[] = ['brilliant', 'great', 'miss', 'mistake', 'blunder']

// a chess.com-style badge pinned to the destination square's corner
const badgeSvg = (tag: Tag) => {
  const g = GLYPH[tag]!
  return `<g><circle cx="79" cy="21" r="19" fill="${CC[tag]}" stroke="#fff" stroke-width="2.5"/><text x="79" y="${g === '★' || g === '≡' || g === '✗' ? 28 : 29}" font-size="${g.length > 1 ? 21 : 25}" font-weight="bold" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">${g}</text></g>`
}

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

// chess.com's eval graph: white's share of the win% fills from the bottom,
// notable moves get their badge-colored dot, click (or drag) to seek.
function EvalGraph({ a, p, onSeek }: { a: GameAnalysis; p: number; onSeek: (p: number) => void }) {
  const W = 300
  const H = 60
  const n = a.evals.length - 1
  const x = (i: number) => (n ? (i / n) * W : 0)
  const y = (cp: number) => H - (winPct(cp) / 100) * H
  const pts = a.evals.map((cp, i) => `${x(i).toFixed(1)},${y(cp).toFixed(1)}`).join(' ')
  const seek = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(n, Math.round(((e.clientX - r.left) / r.width) * n))))
  }
  return (
    <svg
      className="evalgraph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      onClick={seek}
      onMouseMove={(e) => e.buttons === 1 && seek(e)}
    >
      <rect width={W} height={H} fill="#1f1d1b" />
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="#e8e6e3" />
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#00000055" strokeWidth="0.75" />
      {a.judged.map((jd, i) =>
        DOTS.includes(jd.tag) ? (
          <circle key={i} cx={x(i + 1)} cy={y(a.evals[i + 1])} r="2.4" fill={CC[jd.tag]} stroke="#0008" strokeWidth="0.5" />
        ) : null,
      )}
      <line x1={x(p)} y1="0" x2={x(p)} y2={H} stroke="#f7c631" strokeWidth="1.2" />
    </svg>
  )
}

// The review header: opening name, both accuracies, move counts per badge.
function Summary({ a, sel }: { a: GameAnalysis; sel: FullGame }) {
  const oppName = a.color === 'w' ? sel.black.username : sel.white.username
  const me = a.color
  const them = me === 'w' ? 'b' : 'w'
  const count = (tag: Tag, c: 'w' | 'b') =>
    a.judged.filter((jd, j) => jd.tag === tag && (j % 2 === 0 ? 'w' : 'b') === c).length
  return (
    <>
      {a.opening && <div className="opening">{a.opening}</div>}
      <div className="accrow">
        <span className="accbox">
          You <b className="num">{a.acc[me].toFixed(1)}</b>
        </span>
        <span className="accbox opp">
          {oppName} <b className="num">{a.acc[them].toFixed(1)}</b>
        </span>
      </div>
      <div className="tagtable num">
        {TAGS.map((t) => {
          const mine = count(t, me)
          const theirs = count(t, them)
          if (!mine && !theirs) return null
          return (
            <div key={t} className="tagrow">
              <span>{mine}</span>
              <span className={'tglabel tg-' + t}>
                <i>{GLYPH[t] ?? '·'}</i> {t}
              </span>
              <span className="dim">{theirs}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// The 017 explanation: facts render instantly, the coach voice swaps in when
// Ollama answers (or never does — facts stand alone by design, ADR 0001).
// 027 adds a fixed two-button follow-up: "what if X" (board goes interactive,
// handled by the parent) and "what's the idea" (re-frames these same facts).
// 035 adds retry: same interactive board, but with a pass/fail verdict.
function CoachNote({
  a,
  bl,
  whatIfOn,
  onToggleWhatIf,
  whatIf,
  retryOn,
  onToggleRetry,
  retry,
}: {
  a: GameAnalysis
  bl: Blunder
  whatIfOn: boolean
  onToggleWhatIf: () => void
  whatIf: WhatIf
  retryOn: boolean
  onToggleRetry: () => void
  retry: Retry
}) {
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
  const [idea, setIdea] = useState<null | 'busy' | string>(null)
  useEffect(() => {
    let live = true
    setProse(null)
    setWaiting(true)
    setIdea(null)
    const ctx = `In his game (${a.desc}), playing ${a.color === 'w' ? 'White' : 'Black'}, on move ${Math.floor(bl.ply / 2) + 1} he played ${bl.san}; the engine prefers ${bl.bestSan}.`
    coachSay(`${a.uuid}:${bl.ply}`, ctx, facts, bl.severity === 'blunder' ? 'harsh' : 'plain').then((t) => {
      if (!live) return
      setProse(t)
      setWaiting(false)
    })
    return () => {
      live = false
    }
  }, [a, bl, facts])

  async function showIdea() {
    setIdea('busy')
    const ctx = `In his game (${a.desc}), playing ${a.color === 'w' ? 'White' : 'Black'}, on move ${Math.floor(bl.ply / 2) + 1} he asks what the idea behind ${bl.bestSan} is, instead of his ${bl.san}.`
    const prose = await coachSay(`idea:${a.uuid}:${bl.ply}`, ctx, facts, 'plain', 'idea')
    setIdea(prose ?? facts.join(' '))
  }

  // the generic positional fallback is only ever the sole fact — nothing concrete to reframe
  const genericOnly = facts.length === 1 && facts[0].startsWith(GENERIC_FALLBACK)

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
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <button className="tiny" onClick={onToggleRetry}>
          {retryOn ? 'close retry' : 'retry this move'}
        </button>
        <button className="tiny" onClick={onToggleWhatIf}>
          {whatIfOn ? 'close what if' : 'what if I played X?'}
        </button>
        {!genericOnly && (
          <button className="tiny" onClick={showIdea}>
            what's the idea here?
          </button>
        )}
      </div>
      {retryOn && retry === null && (
        <div className="tiny dim">find the better move on the board</div>
      )}
      {retry === 'busy' && <div className="tiny dim">engine checking your move…</div>}
      {retry !== null && typeof retry === 'object' && (
        <div className={'whynot ' + (retry.ok ? 'good' : 'bad')}>{retry.text}</div>
      )}
      {whatIfOn && whatIf === null && (
        <div className="tiny dim">click a piece, then a square, on the board</div>
      )}
      {whatIf === 'busy' && <div className="tiny dim">engine checking your move…</div>}
      {whatIf !== null && typeof whatIf === 'object' && (
        <div className="whynot">
          {whatIf.text}
          <div className="tiny dim">{whatIf.tag}</div>
        </div>
      )}
      {idea === 'busy' && <div className="tiny dim">coach voice thinking…</div>}
      {idea !== null && typeof idea === 'string' && <div className="whynot">{idea}</div>}
    </div>
  )
}

// The 016 rough take grown into 035's Game Review clone: pick a game, the
// engine walks it at MultiPV 2, and the review renders accuracy, per-move
// badges, the eval graph/bar, and inline retry — in chess.com's own skin
// (mode-scoped; the scoresheet identity holds everywhere else, see map).
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
  const [whatIfOn, setWhatIfOn] = useState(false)
  const [whatIf, setWhatIf] = useState<WhatIf>(null)
  const [retryOn, setRetryOn] = useState(false)
  const [retry, setRetry] = useState<Retry>(null)

  const storeRef = useRef<AnalysisStore>({ games: {} })
  const openingsRef = useRef<Openings>(new Map())
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
      openingsRef.current = await loadOpenings()
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
    analyzeGame(g, lines, openingsRef.current, engine, (done, total) => setProgress({ done, total }))
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

  // leaving the flagged move (or the game) closes any open exploration
  useEffect(() => {
    setWhatIfOn(false)
    setWhatIf(null)
    setRetryOn(false)
    setRetry(null)
  }, [p, sel])

  // board follows the viewed ply; flagged next-move draws played-vs-best arrows
  // and the just-played move wears its chess.com badge on the landing square.
  // 027/035: while what-if or retry is on, the board takes clicks instead.
  useEffect(() => {
    if (!cg.current || !analysis || !moves.length) return
    const fen = p === 0 ? START_FEN : moves[p - 1].after
    const pos = new Chess(fen)
    const bl = analysis.blunders.find((b) => b.ply === p)
    const interactive = (whatIfOn || retryOn) && bl
    cg.current.set({
      fen,
      orientation: analysis.color === 'w' ? 'white' : 'black',
      turnColor: pos.turn() === 'w' ? 'white' : 'black',
      check: pos.inCheck(),
      lastMove: p > 0 ? ([moves[p - 1].from, moves[p - 1].to] as Key[]) : undefined,
      movable: interactive
        ? {
            free: false,
            color: pos.turn() === 'w' ? 'white' : 'black',
            dests: destsOf(pos),
            showDests: true,
          }
        : { free: false, dests: new Map() },
    })
    const played = p > 0 ? analysis.judged[p - 1] : undefined
    cg.current.setAutoShapes([
      ...(played && GLYPH[played.tag]
        ? [{ orig: moves[p - 1].to as Key, customSvg: { html: badgeSvg(played.tag) } }]
        : []),
      ...(bl
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
        : []),
    ])
  }, [p, analysis, moves, whatIfOn, retryOn])

  useEffect(() => {
    if (!analysis) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setP((x) => Math.max(0, x - 1))
      if (e.key === 'ArrowRight') setP((x) => Math.min(moves.length, x + 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [analysis, moves.length])

  // shared by what-if and retry: play the clicked move from the flagged
  // position, auto-queening on promotion
  function tryMoveFrom(fen: string, from: string, to: string): { c: Chess; mv: Move } | null {
    const c = new Chess(fen)
    try {
      return { c, mv: c.move({ from, to }) }
    } catch {
      try {
        return { c, mv: c.move({ from, to, promotion: 'q' }) }
      } catch {
        return null
      }
    }
  }

  // 027 "what if I played X?": same shape as LineDrill's explainMiss — eval the
  // clicked move and the engine's best move at equal depth, then let facts.ts
  // walk both lines the same way it does for the real played move.
  async function tryWhatIf(from: string, to: string) {
    if (!analysis) return
    const bl = analysis.blunders.find((b) => b.ply === p)
    if (!bl) return
    const t = tryMoveFrom(bl.fen, from, to)
    if (!t) return
    const { c: cA, mv } = t
    const cB = new Chess(bl.fen)
    cB.move(bl.bestSan)
    setWhatIf('busy')
    const eng = (engRef.current ??= startEngine())
    const [a, b] = await Promise.all([eng.evalFen(cA.fen(), WHY_MS), eng.evalFen(cB.fen(), WHY_MS)])
    const facts = computeFacts({
      fen: bl.fen,
      played: mv.san,
      best: bl.bestSan,
      bestLine: [bl.bestSan, ...sanLine(cB.fen(), b.pv, 4)],
      punishLine: sanLine(cA.fen(), a.pv, 5),
      swingCp: Math.max(0, a.cp - b.cp),
    })
    setWhatIf({ text: facts.join(' '), tag: 'coach voice thinking…' })
    const ctx = `He's exploring "what if I played ${mv.san}?" instead of ${bl.san} on move ${Math.floor(bl.ply / 2) + 1} of his game.`
    const prose = await coachSay(`whatif:${bl.ply}:${mv.san}`, ctx, facts)
    setWhatIf(prose ? { text: prose, tag: 'coach voice' } : { text: facts.join(' '), tag: 'coach voice offline — facts only' })
  }

  // 035 inline retry: success = the engine move, or anything within RETRY_CP
  // of it (both sides evaluated at the same depth, mover's perspective).
  async function tryRetry(from: string, to: string) {
    if (!analysis) return
    const bl = analysis.blunders.find((b) => b.ply === p)
    if (!bl) return
    const t = tryMoveFrom(bl.fen, from, to)
    if (!t) return
    const { c: cA, mv } = t
    const uci = mv.from + mv.to + (mv.promotion ?? '')
    if (uci === bl.best) {
      setRetry({ ok: true, text: `✓ ${mv.san} — the engine's move. That was the position.` })
      return
    }
    setRetry('busy')
    const cB = new Chess(bl.fen)
    cB.move(bl.bestSan)
    const eng = (engRef.current ??= startEngine())
    const [a, b] = await Promise.all([eng.evalFen(cA.fen(), WHY_MS), eng.evalFen(cB.fen(), WHY_MS)])
    // both evals are opponent-to-move; negate for the mover's view
    const short = -a.cp < -b.cp - RETRY_CP ? -b.cp - -a.cp : 0
    if (!short) {
      setRetry({ ok: true, text: `✓ ${mv.san} holds — within ${RETRY_CP}cp of ${bl.bestSan}.` })
    } else {
      setRetry({ ok: false, text: `✗ ${mv.san} still loses ${(short / 100).toFixed(1)} vs ${bl.bestSan} — try again.` })
      // snap the board back for the next attempt
      const pos = new Chess(bl.fen)
      cg.current?.set({
        fen: bl.fen,
        turnColor: pos.turn() === 'w' ? 'white' : 'black',
        lastMove: undefined,
        movable: { free: false, color: pos.turn() === 'w' ? 'white' : 'black', dests: destsOf(pos), showDests: true },
      })
    }
  }

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

  // ---- one game: the review, in chess.com's skin (.ccr — mode-scoped) ----
  const flagOf = (j: number) => analysis?.blunders.find((b) => b.ply === j)
  const blCur = flagOf(p)
  const blunderCount = analysis?.blunders.filter((b) => b.severity === 'blunder').length ?? 0
  const mistakeCount = (analysis?.blunders.length ?? 0) - blunderCount
  return (
    <>
      <ModeHead title="Game analysis" onExit={onExit} />
      <div className="analysis ccr">
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
              <div className="withbar">
                <div className={'evalbar' + (analysis.color === 'b' ? ' flip' : '')}>
                  <div className="wfill" style={{ height: `${winPct(analysis.evals[p] ?? 0)}%` }} />
                </div>
                <Board size={446} onReady={(api) => (cg.current = api)} onMove={retryOn ? tryRetry : tryWhatIf} />
              </div>
              <div className="boardfoot">
                <b>eval {fmtEval(analysis.evals[p] ?? 0)}</b>
                {p > 0 && analysis.judged[p - 1] && (
                  <span className={'tglabel tg-' + analysis.judged[p - 1].tag}>
                    {moves[p - 1].san} — {analysis.judged[p - 1].tag}
                  </span>
                )}
                <span>← → or click a move</span>
              </div>
            </div>
            <div className="side">
              <div className="panel">
                <Summary a={analysis} sel={sel} />
                <EvalGraph a={analysis} p={p} onSeek={setP} />
              </div>
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
                      {GLYPH[analysis.judged[b.ply]?.tag] ?? '?'} — better {b.bestSan} (−
                      {(b.swingCp / 100).toFixed(1)})
                      {b.pvSan.length > 1 && (
                        <span className="dim"> because {b.pvSan.join(' ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {blCur && (
                <CoachNote
                  a={analysis}
                  bl={blCur}
                  whatIfOn={whatIfOn}
                  onToggleWhatIf={() => {
                    setWhatIfOn((v) => !v)
                    setWhatIf(null)
                    setRetryOn(false)
                    setRetry(null)
                  }}
                  whatIf={whatIf}
                  retryOn={retryOn}
                  onToggleRetry={() => {
                    setRetryOn((v) => !v)
                    setRetry(null)
                    setWhatIfOn(false)
                    setWhatIf(null)
                  }}
                  retry={retry}
                />
              )}
              <div className="panel movelist">
                {moves.map((m, j) => {
                  const jd = analysis.judged[j]
                  const f = flagOf(j)
                  return (
                    <span
                      key={j}
                      className={'mv' + (j + 1 === p ? ' cur' : '') + (jd ? ' tg-' + jd.tag : '')}
                      title={jd ? `${jd.tag} · ${jd.acc.toFixed(1)}%` : undefined}
                      onClick={() => setP(f ? j : j + 1)}
                    >
                      {m.color === 'w' ? `${j / 2 + 1}.` : ''}
                      {m.san}
                      {jd ? (GLYPH[jd.tag] ?? '') : ''}
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
