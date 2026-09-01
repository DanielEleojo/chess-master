import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { runChecks, type Check, type Seeds } from '../lib/selftest'
import { monthKey } from '../lib/sync'
import { startEngine } from '../lib/engine'
import { MODEL, coachUp } from '../lib/coach'

// The Selftest surface. Every check that can be honest without a browser lives
// in lib/selftest.ts and runs in `npm test` too; the ones below genuinely need
// a running server, the Stockfish worker, or the network, so they stay here and
// stream in after the synchronous run.
async function liveChecks(push: (c: Check) => void): Promise<void> {
  const payload = { probe: Math.floor(performance.now()) }
  let roundtrip = false
  try {
    const put = await fetch('/api/data/selftest', { method: 'PUT', body: JSON.stringify(payload) })
    const back = await (await fetch('/api/data/selftest')).json()
    roundtrip = put.ok && back.probe === payload.probe
  } catch {
    /* stays false */
  }
  push({ name: 'data middleware PUT/GET round-trip', pass: roundtrip })

  let archives = false
  try {
    const a = await (await fetch('/api/data/archives/' + monthKey(new Date()))).json()
    archives = Array.isArray(a.games)
  } catch {
    /* stays false */
  }
  push({ name: 'archives/ route serves the current month', pass: archives })

  let bookRows = 0
  try {
    const t = await (await fetch('/data/openings.tsv')).text()
    bookRows = t.split('\n').filter((l) => l.includes('\t')).length
  } catch {
    /* stays 0 */
  }
  push({ name: `openings.tsv vendored (${bookRows} positions)`, pass: bookRows >= 3000 })

  let months = false
  try {
    const l = await (await fetch('/api/data/archives')).json()
    months = Array.isArray(l) && l.includes(monthKey(new Date()))
  } catch {
    /* stays false */
  }
  push({ name: 'archives month listing includes current month', pass: months })

  // live engine: worker + wasm actually load and return a sane startpos eval
  let engineOk = false
  try {
    const eng = startEngine()
    const s = await eng.evalFen(new Chess().fen(), 80)
    eng.quit()
    engineOk = !!s.best && /^[a-h][1-8][a-h][1-8]/.test(s.best) && Math.abs(s.cp) < 150
  } catch {
    /* stays false */
  }
  push({ name: 'stockfish worker evals startpos', pass: engineOk })

  // coach voice (017): reachability is informational — facts-only fallback is by design
  const up = await coachUp()
  push({
    name: `coach voice: ${up ? `reachable (${MODEL})` : 'down — facts-only fallback active'}`,
    pass: true,
  })
}

export function Selftest(seeds: Seeds) {
  const [out, setOut] = useState<Check[]>([])
  const { lines, traps, tactics, learn } = seeds

  useEffect(() => {
    setOut(runChecks({ lines, traps, tactics, learn }))
    void liveChecks((c) => setOut((o) => [...o, c]))
  }, [lines, traps, tactics, learn])

  const fails = out.filter((c) => !c.pass).length
  return (
    <div className="card selftest">
      <h2>Selftest {out.length ? (fails ? `❌ ${fails} failing` : '✅ all green') : '…'}</h2>
      <pre>{out.map((c) => (c.pass ? 'PASS' : 'FAIL') + '  ' + c.name).join('\n')}</pre>
    </div>
  )
}
