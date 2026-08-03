import { useEffect, useRef, useState } from 'react'
import { parseGames, type Line } from './lib/pgn'
import { emptyHistory, loadHistory, type History } from './lib/history'
import { LineDrill } from './modes/LineDrill'
import { TrapCards, buildDeck } from './modes/TrapCards'
import { Selftest } from './modes/Selftest'

type Mode = 'home' | 'lines' | 'traps' | 'selftest'

export default function App() {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [lines, setLines] = useState<Line[]>([])
  const [traps, setTraps] = useState<Line[]>([])
  const historyRef = useRef<History>(emptyHistory())
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(location.search).get('selftest') ? 'selftest' : 'home',
  )
  const [dealNo, setDealNo] = useState(0) // remount key: fresh session per entry

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

  if (mode === 'lines')
    return <LineDrill key={dealNo} lines={lines} history={h} onExit={() => setMode('home')} />
  if (mode === 'traps')
    return <TrapCards key={dealNo} traps={traps} history={h} onExit={() => setMode('home')} />
  if (mode === 'selftest') return <Selftest lines={lines} traps={traps} />

  const lineStats = Object.values(h.lines)
  const drilled = lineStats.reduce((n, s) => n + s.seen, 0)
  const clean = lineStats.reduce((n, s) => n + s.seen - s.missed, 0)
  const cardStats = Object.values(h.traps)
  const dealt = cardStats.reduce((n, s) => n + s.seen, 0)
  const firstTry = cardStats.reduce((n, s) => n + s.seen - s.missed, 0)
  return (
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
      </div>
      <a className="tiny" href="?selftest=1">
        selftest
      </a>
    </div>
  )
}
