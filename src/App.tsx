import { useEffect, useRef, useState, type ReactNode } from 'react'
import { parseGames, type Line } from './lib/pgn'
import { emptyHistory, loadHistory, type History } from './lib/history'
import { startSync } from './lib/sync'
import { LineDrill } from './modes/LineDrill'
import { TrapCards, buildDeck } from './modes/TrapCards'
import { Analysis } from './modes/Analysis'
import { Selftest } from './modes/Selftest'

type Mode = 'home' | 'lines' | 'traps' | 'analysis' | 'selftest'
type Toast = { id: number; text: string }

// "last synced Xs ago" — home screen only, no spinners (006)
function LastSynced({ at }: { at: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  if (!at) return <div className="tiny dim">syncing…</div>
  return <div className="tiny dim">last synced {Math.max(0, Math.round((Date.now() - at) / 1000))}s ago</div>
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
  const toastId = useRef(0)

  // home-card "N new" count — refreshed each time we land on home
  useEffect(() => {
    if (mode !== 'home') return
    fetch('/api/data/sync-state')
      .then((r) => (r.ok ? r.json() : {}))
      .then((s: { unseen?: string[] }) => setUnseenN(s.unseen?.length ?? 0))
      .catch(() => {})
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
        const [rep, trp, hist] = await Promise.all([
          fetch('/data/repertoire.pgn').then((r) => r.text()),
          fetch('/data/traps.pgn').then((r) => r.text()),
          loadHistory(),
        ])
        setLines(parseGames(rep))
        setTraps(parseGames(trp))
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
    return <div className="center bad">Couldn't load data/*.pgn — is this running via npm run dev?</div>

  const h = historyRef.current
  const go = (m: Mode) => {
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
    return wrap(<LineDrill key={dealNo} lines={lines} history={h} onExit={() => setMode('home')} />)
  if (mode === 'traps')
    return wrap(<TrapCards key={dealNo} traps={traps} history={h} onExit={() => setMode('home')} />)
  if (mode === 'analysis')
    return wrap(<Analysis key={dealNo} lines={lines} onExit={() => setMode('home')} />)
  if (mode === 'selftest') return wrap(<Selftest lines={lines} traps={traps} />)

  const lineStats = Object.values(h.lines)
  const drilled = lineStats.reduce((n, s) => n + s.seen, 0)
  const clean = lineStats.reduce((n, s) => n + s.seen - s.missed, 0)
  const cardStats = Object.values(h.traps)
  const dealt = cardStats.reduce((n, s) => n + s.seen, 0)
  const firstTry = cardStats.reduce((n, s) => n + s.seen - s.missed, 0)
  return wrap(
    <div className="home">
      <h1>Chess Master</h1>
      <div className="sub">openings first — the rest hangs off this</div>
      <div className="modes">
        <button className="modecard" onClick={() => go('lines')}>
          <h2>Line drill</h2>
          <div className="sub">
            {lines.length} repertoire lines · endless streak · misses come back
          </div>
          {drilled > 0 && (
            <div className="sub dim">
              {drilled} drilled · {Math.round((clean / drilled) * 100)}% clean
            </div>
          )}
        </button>
        <button className="modecard" onClick={() => go('traps')}>
          <h2>Trap cards</h2>
          <div className="sub">
            {buildDeck(traps).length} punish-the-junk cards · 10 per deal
          </div>
          {dealt > 0 && (
            <div className="sub dim">
              {dealt} dealt · {Math.round((firstTry / dealt) * 100)}% first try
            </div>
          )}
        </button>
        <button className="modecard" onClick={() => go('analysis')}>
          <h2>
            Game analysis{' '}
            {unseenN > 0 && <span className="badge gold">{unseenN} new</span>}
          </h2>
          <div className="sub">
            engine-checks your real games · blunders + where you left book
          </div>
        </button>
      </div>
      <a className="tiny" href="?selftest=1">
        selftest
      </a>
      <LastSynced at={syncedAt} />
    </div>,
  )
}
