import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import type { Line } from '../lib/pgn'
import { makeDrill, userMoveIdxs } from '../lib/drill'
import { buildDeck } from './TrapCards'
import { bump, type Stat } from '../lib/history'
import { describeGame, monthKey, newGames, type Game } from '../lib/sync'

// Ported from the prototype's ?selftest=1 — same logic checks, now against the
// fetched real seed files, plus a middleware round-trip. The app's one check.
export function Selftest({ lines, traps }: { lines: Line[]; traps: Line[] }) {
  const [out, setOut] = useState<string[]>([])

  useEffect(() => {
    const res: string[] = []
    const ok = (name: string, cond: boolean) => res.push((cond ? 'PASS' : 'FAIL') + '  ' + name)

    ok(`repertoire parsed: ${lines.length} lines (expect 22)`, lines.length === 22)
    ok(`traps parsed: ${traps.length} traps (expect 15)`, traps.length === 15)
    for (const l of [...lines, ...traps])
      ok(
        `${l.name}: ${l.moves.length} plies, has ${l.trainAs} moves`,
        l.moves.length >= 2 && userMoveIdxs(l).length >= 1,
      )
    const commented = lines.filter((l) => Object.keys(l.comments).length > 0).length
    ok(`repertoire why-comments survive parsing (${commented} lines have them)`, commented >= 5)

    const d = makeDrill(lines[0])
    d.autoMoves()
    ok('drill starts on user turn', !d.done() && d.expected().color === d.uc)
    const w = d.tryMove('a2', 'a3')
    ok('wrong move rejected and position restored', !w.ok && d.chess.fen() === new Chess().fen())
    let steps = 0
    while (!d.done() && steps++ < 40) {
      const e = d.expected()
      if (e.color === d.uc) {
        if (!d.tryMove(e.from, e.to).ok) break
      } else d.autoMoves()
    }
    ok('full line completes on correct moves', d.done())

    const deck = buildDeck(traps)
    ok(`trap deck: ${deck.length} cards (expect >= 15)`, deck.length >= 15)
    const withWhy = deck.filter((c) => c.line.comments[c.line.moves[c.k].after]).length
    ok(`trap cards carrying a why-comment: ${withWhy} (expect >= 12)`, withWhy >= 12)
    let cardsOk = true
    for (const c of deck) {
      const cd = makeDrill(c.line, c.k)
      const e = cd.expected()
      if (e.color !== cd.uc || !cd.tryMove(e.from, e.to).ok) cardsOk = false
    }
    ok('every trap card starts on the punisher and accepts its move', cardsOk)

    // grace first attempt (ticket 012): first-ever miss forgiven, hits and later misses count
    const g: Record<string, Stat> = {}
    bump(g, 'x', true)
    ok('first-ever miss not recorded', g.x.seen === 1 && g.x.missed === 0)
    bump(g, 'x', true)
    ok('second miss recorded', g.x.seen === 2 && g.x.missed === 1)
    bump(g, 'y', false)
    ok('first-attempt hit credited', g.y.seen === 1 && g.y.missed === 0)

    // live sync helpers (ticket 015)
    const mk = (uuid: string, myResult: string, oppResult: string): Game => ({
      uuid,
      time_class: 'rapid',
      white: { username: 'Opp', result: oppResult },
      black: { username: 'BabaDaniel', result: myResult },
    })
    const won = mk('a', 'win', 'checkmated')
    const lost = mk('b', 'timeout', 'win')
    const drew = mk('c', 'stalemate', 'stalemate')
    ok('sync diff finds only unseen uuids', newGames([won], [won, lost]).map((g) => g.uuid).join() === 'b')
    ok('sync toast: win', describeGame(won) === 'You won vs Opp · rapid')
    ok('sync toast: loss', describeGame(lost) === 'You lost vs Opp · rapid')
    ok('sync toast: draw', describeGame(drew) === 'You drew vs Opp · rapid')
    ok('month key is UTC YYYY-MM', /^\d{4}-\d{2}$/.test(monthKey(new Date())))

    setOut(res)
    ;(async () => {
      const payload = { probe: Math.floor(performance.now()) }
      let roundtrip = false
      try {
        const put = await fetch('/api/data/selftest', { method: 'PUT', body: JSON.stringify(payload) })
        const back = await (await fetch('/api/data/selftest')).json()
        roundtrip = put.ok && back.probe === payload.probe
      } catch {
        /* stays false */
      }
      setOut((o) => [...o, (roundtrip ? 'PASS' : 'FAIL') + '  data middleware PUT/GET round-trip'])
      let archives = false
      try {
        const a = await (await fetch('/api/data/archives/' + monthKey(new Date()))).json()
        archives = Array.isArray(a.games)
      } catch {
        /* stays false */
      }
      setOut((o) => [...o, (archives ? 'PASS' : 'FAIL') + '  archives/ route serves the current month'])
    })()
  }, [lines, traps])

  const fails = out.filter((s) => s.startsWith('FAIL')).length
  return (
    <div className="card selftest">
      <h2>Selftest {out.length ? (fails ? `❌ ${fails} failing` : '✅ all green') : '…'}</h2>
      <pre>{out.join('\n')}</pre>
    </div>
  )
}
