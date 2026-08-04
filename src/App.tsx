import { useEffect, useRef, useState, type ReactNode } from 'react'
import { parseGames, type Line } from './lib/pgn'
import { emptyHistory, loadHistory, type History } from './lib/history'
import { loadAnalyses } from './lib/analyze'
import { lichessCards, loadPuzzles, ownCards, type PCard } from './lib/puzzles'
import { milestone, ratingHistory, MILESTONES, type Milestone } from './lib/recommend'
import { startSync, USER, type Game } from './lib/sync'
import { CoachCard } from './components/CoachCard'
import { LineDrill } from './modes/LineDrill'
import { TrapCards, buildDeck } from './modes/TrapCards'
import { Puzzles } from './modes/Puzzles'
import { Analysis } from './modes/Analysis'
import { Spar, RUNGS } from './modes/Spar'
import { Selftest } from './modes/Selftest'

type Mode = 'home' | 'lines' | 'traps' | 'puzzles' | 'analysis' | 'spar' | 'selftest'
type Toast = { id: number; text: string }

// "last synced Xs ago" — home screen only, no spinners (006)
function LastSynced({ at }: { at: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  if (!at) return <span>syncing…</span>
  return <span>synced {Math.max(0, Math.round((Date.now() - at) / 1000))}s ago</span>
}

// The milestone ladder (018) drawn to scale: every rung from his next stop up
// to master, his marker where the rating actually lands. Rungs sit at even
// spacing — it's a ladder he climbs, not a linear rating axis. The first entry
// is the floor below the bottom milestone, so a sub-400 marker has somewhere
// to sit; it carries no tick of its own.
const LADDER = [MILESTONES[0] - 100, ...MILESTONES]

function Climb({ ms }: { ms: Milestone }) {
  const last = LADDER.length - 1
  let i = LADDER.findIndex((_, k) => k < last && ms.rating < LADDER[k + 1])
  if (i < 0) i = last - 1 // past the top rung — pin to the end
  const raw = (i + (ms.rating - LADDER[i]) / (LADDER[i + 1] - LADDER[i])) / last
  const pos = Math.min(100, Math.max(0, raw * 100))
  return (
    <section className="climb">
      <div className="climbnow">
        <span className="rating">{ms.rating}</span>
        <span className="eyebrow">{ms.timeClass}</span>
        {ms.trend !== 0 && (
          <span className={`trend${ms.trend < 0 ? ' down' : ''}`}>
            {ms.trend > 0 ? '+' : ''}
            {ms.trend} last 10 games
          </span>
        )}
      </div>
      <div className="rail">
        <span className="covered" style={{ width: `${pos}%` }} />
        <span className="marker" style={{ left: `${pos}%` }} />
        {MILESTONES.map((m, k) => {
          const at = `${((k + 1) / last) * 100}%`
          const kind = m === ms.next ? ' next' : k === MILESTONES.length - 1 ? ' last' : ''
          return (
            <span key={m}>
              <span className={`rung-tick${kind}`} style={{ left: at }} />
              <span className={`rung-label${kind}`} style={{ left: at }}>
                {m}
              </span>
              {kind && (
                <span className="rung-name" style={{ left: at }}>
                  {kind === ' next' ? 'next stop' : 'master'}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </section>
  )
}

export default function App() {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [lines, setLines] = useState<Line[]>([])
  const [traps, setTraps] = useState<Line[]>([])
  const historyRef = useRef<History>(emptyHistory())
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(location.search).get('selftest') ? 'selftest' : 'home',
  )
  const [dealNo, setDealNo] = useState(0) // remount key: fresh session per entry
  const [toasts, setToasts] = useState<Toast[]>([])
  const [syncedAt, setSyncedAt] = useState(0)
  const [unseenN, setUnseenN] = useState(0)
  const [focus, setFocus] = useState<string | undefined>() // coach deep-link: drill this line first
  const [ownOnly, setOwnOnly] = useState(false) // coach deep-link: tactics deals his blunders only
  const [tactics, setTactics] = useState<PCard[]>([])
  const [own, setOwn] = useState<PCard[]>([])
  const [analysedN, setAnalysedN] = useState(0)
  const [rung, setRung] = useState(0) // sparring ladder, see Spar.tsx — localStorage
  const [ms, setMs] = useState<Milestone | null>(null) // real rating off the archives
  const toastId = useRef(0)

  // Rating ladder from the synced archives — read once at boot, shown in the
  // home header and reused by the coach's pitch, so neither refetches it.
  useEffect(() => {
    ;(async () => {
      const months: string[] = await fetch('/api/data/archives')
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
      const games: Game[] = (
        await Promise.all(
          months.map((m) =>
            fetch(`/api/data/archives/${m}`)
              .then((r) => (r.ok ? r.json() : { games: [] }))
              .catch(() => ({ games: [] })),
          ),
        )
      ).flatMap((a) => a.games ?? [])
      setMs(milestone(ratingHistory(games)))
    })()
  }, [])

  // home-card "N new" count and his own tactics cards — both refreshed each time
  // we land on home, so a game analyzed this session is dealable straight after
  useEffect(() => {
    if (mode !== 'home') return
    fetch('/api/data/sync-state')
      .then((r) => (r.ok ? r.json() : {}))
      .then((s: { unseen?: string[] }) => setUnseenN(s.unseen?.length ?? 0))
      .catch(() => {})
    loadAnalyses().then((s) => {
      const games = Object.values(s.games)
      setOwn(ownCards(games))
      setAnalysedN(games.length)
    })
    setRung(+(localStorage.getItem('cm.rung') ?? 0) || 0)
  }, [mode])

  useEffect(
    () =>
      startSync({
        onArrivals: (msgs) =>
          setToasts((t) => [...t, ...msgs.map((text) => ({ id: ++toastId.current, text }))]),
        onSynced: setSyncedAt,
      }),
    [],
  )

  useEffect(() => {
    ;(async () => {
      try {
        const [rep, trp, hist, puz] = await Promise.all([
          fetch('/data/repertoire.pgn').then((r) => r.text()),
          fetch('/data/traps.pgn').then((r) => r.text()),
          loadHistory(),
          loadPuzzles(),
        ])
        setLines(parseGames(rep))
        setTraps(parseGames(trp))
        setTactics(lichessCards(puz))
        historyRef.current = hist
        setState('ready')
      } catch (e) {
        console.error(e)
        setState('error')
      }
    })()
  }, [])

  if (state === 'loading') return <div className="center dim">loading seeds…</div>
  if (state === 'error')
    return (
      <div className="center bad">Couldn't load data/*.pgn — is this running via npm run dev?</div>
    )

  const h = historyRef.current
  const go = (m: Mode, focusLine?: string, only?: boolean) => {
    setFocus(focusLine)
    setOwnOnly(!!only)
    setDealNo((n) => n + 1)
    setMode(m)
  }

  // Toasts float over every mode — non-blocking, stay until clicked (006)
  const toastStack = (
    <div className="toasts">
      {toasts.map((t) => (
        <button
          key={t.id}
          className="toast"
          onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
        >
          {t.text} <span className="dim">✕</span>
        </button>
      ))}
    </div>
  )
  const wrap = (view: ReactNode) => (
    <>
      {view}
      {toastStack}
    </>
  )

  if (mode === 'lines')
    return wrap(
      <LineDrill
        key={dealNo}
        lines={lines}
        history={h}
        focus={focus}
        onExit={() => setMode('home')}
      />,
    )
  if (mode === 'traps')
    return wrap(<TrapCards key={dealNo} traps={traps} history={h} onExit={() => setMode('home')} />)
  if (mode === 'puzzles')
    return wrap(
      <Puzzles
        key={dealNo}
        lichess={tactics}
        own={own}
        history={h}
        ownOnly={ownOnly}
        onExit={() => setMode('home')}
      />,
    )
  if (mode === 'analysis')
    return wrap(<Analysis key={dealNo} lines={lines} onExit={() => setMode('home')} />)
  if (mode === 'spar')
    return wrap(<Spar key={dealNo} lines={lines} onExit={() => setMode('home')} />)
  if (mode === 'selftest') return wrap(<Selftest lines={lines} traps={traps} tactics={tactics} />)

  const lineStats = Object.values(h.lines)
  const drilled = lineStats.reduce((n, s) => n + s.seen, 0)
  const clean = lineStats.reduce((n, s) => n + s.seen - s.missed, 0)
  const cardStats = Object.values(h.traps)
  const dealt = cardStats.reduce((n, s) => n + s.seen, 0)
  const firstTry = cardStats.reduce((n, s) => n + s.seen - s.missed, 0)
  const puzStats = Object.values(h.puzzles)
  const puzzled = puzStats.reduce((n, s) => n + s.seen, 0)
  const puzFirst = puzStats.reduce((n, s) => n + s.seen - s.missed, 0)
  return wrap(
    <div className="home">
      <header className="sheethead">
        <span className="eyebrow">Chess Master</span>
        <span className="who">
          {USER} · <LastSynced at={syncedAt} />
        </span>
      </header>
      {ms && <Climb ms={ms} />}
      <CoachCard history={h} unseen={unseenN} lines={lines} ms={ms} onGo={go} />
      <div className="ledger">
        <button className="row" onClick={() => go('lines')}>
          <span className="name">Line drill</span>
          <span className="what">{lines.length} repertoire lines · misses come back</span>
          <span className="stat">
            {drilled > 0 ? (
              <>
                <b>{drilled}</b> drilled · <b>{Math.round((clean / drilled) * 100)}%</b> clean
              </>
            ) : (
              'not drilled yet'
            )}
          </span>
        </button>
        <button className="row" onClick={() => go('traps')}>
          <span className="name">Trap cards</span>
          <span className="what">{buildDeck(traps).length} cards that punish junk openings</span>
          <span className="stat">
            {dealt > 0 ? (
              <>
                <b>{dealt}</b> dealt · <b>{Math.round((firstTry / dealt) * 100)}%</b> first try
              </>
            ) : (
              'not dealt yet'
            )}
          </span>
        </button>
        <button className="row" onClick={() => go('puzzles')}>
          <span className="name">Tactics</span>
          <span className="what">
            {tactics.length} puzzles from your openings
            {own.length > 0 && <> · {own.length} of your own positions</>}
          </span>
          <span className="stat">
            {puzzled > 0 ? (
              <>
                <b>{puzzled}</b> solved · <b>{Math.round((puzFirst / puzzled) * 100)}%</b> first try
              </>
            ) : (
              'not solved yet'
            )}
          </span>
        </button>
        <button className="row" onClick={() => go('analysis')}>
          <span className="name">Game analysis</span>
          <span className="what">engine-checks your real games for blunders</span>
          <span className="stat">
            {unseenN > 0 && <span className="new">{unseenN} new · </span>}
            <b>{analysedN}</b> analysed
          </span>
        </button>
        <button className="row" onClick={() => go('spar')}>
          <span className="name">Sparring</span>
          <span className="what">play a Stockfish weak enough to beat</span>
          <span className="stat">
            rung <b>{rung + 1}</b>/{RUNGS.length} · {RUNGS[rung].name}
          </span>
        </button>
      </div>
      <div className="homefoot">
        <a className="tiny" href="?selftest=1">
          selftest
        </a>
      </div>
    </div>,
  )
}
