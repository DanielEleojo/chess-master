import { useEffect, useRef, useState, type ReactNode } from 'react'
import { parseGames, type Line } from './lib/pgn'
import { emptyHistory, loadHistory, type History } from './lib/history'
import { loadAnalyses } from './lib/analyze'
import { lichessCards, loadPuzzles, ownCards, type PCard } from './lib/puzzles'
import { startSync } from './lib/sync'
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
  if (!at) return <div className="tiny dim">syncing…</div>
  return (
    <div className="tiny dim">
      last synced {Math.max(0, Math.round((Date.now() - at) / 1000))}s ago
    </div>
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
  const toastId = useRef(0)

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
      <h1>Chess Master</h1>
      <div className="sub">openings first — the rest hangs off this</div>
      <CoachCard history={h} unseen={unseenN} lines={lines} onGo={go} />
      <div className="modes">
        <button className="modecard" onClick={() => go('lines')}>
          <h2>Line drill</h2>
          <div className="sub">
            {lines.length} repertoire lines · endless streak · misses come back
          </div>
          <div className="stat">
            {drilled > 0 ? (
              <>
                <b>{drilled}</b> drilled · <b>{Math.round((clean / drilled) * 100)}%</b> clean
              </>
            ) : (
              'not drilled yet'
            )}
          </div>
        </button>
        <button className="modecard" onClick={() => go('traps')}>
          <h2>Trap cards</h2>
          <div className="sub">{buildDeck(traps).length} punish-the-junk cards · 10 per deal</div>
          <div className="stat">
            {dealt > 0 ? (
              <>
                <b>{dealt}</b> dealt · <b>{Math.round((firstTry / dealt) * 100)}%</b> first try
              </>
            ) : (
              'not dealt yet'
            )}
          </div>
        </button>
        <button className="modecard" onClick={() => go('puzzles')}>
          <h2>Tactics</h2>
          <div className="sub">
            {own.length > 0 && <>your {own.length} flagged positions · </>}
            {tactics.length} puzzles from your openings · 10 per deal
          </div>
          <div className="stat">
            {puzzled > 0 ? (
              <>
                <b>{puzzled}</b> solved · <b>{Math.round((puzFirst / puzzled) * 100)}%</b> first try
              </>
            ) : (
              'not solved yet'
            )}
          </div>
        </button>
        <button className="modecard" onClick={() => go('analysis')}>
          <h2>
            Game analysis
            {unseenN > 0 && <span className="badge gold">{unseenN} new</span>}
          </h2>
          <div className="sub">engine-checks your real games · blunders + where you left book</div>
          <div className="stat">
            <b>{analysedN}</b> analysed
          </div>
        </button>
        <button className="modecard wide" onClick={() => go('spar')}>
          <h2>
            Sparring <span className="badge gold">{RUNGS[rung].name}</span>
          </h2>
          <div className="sub">
            play a weakened Stockfish · fresh game or on from a repertoire line
          </div>
          <div className="stat">beat it twice and the rung retires — the ladder only goes up</div>
        </button>
      </div>
      <div className="homefoot">
        <LastSynced at={syncedAt} />
        <a className="tiny" href="?selftest=1">
          selftest
        </a>
      </div>
    </div>,
  )
}
