import { useEffect, useRef, useState } from 'react'
import { ModeHead } from '../components/ModeHead'
import { coachPitch } from '../lib/coach'
import { startEngine, type Engine } from '../lib/engine'
import { loadOpenings, type Openings } from '../lib/openings'
import type { Line } from '../lib/pgn'
import { MILESTONES, TREND_N, type Milestone, type Pick } from '../lib/recommend'
import { SCAN_N, gapReport } from '../lib/gaps'
import type { Game } from '../lib/sync'
import {
  ANALYSIS_V,
  MOVE_MS,
  analyzeGame,
  loadAnalyses,
  saveAnalyses,
  type Analysis,
  type AnalysisStore,
  type FullGame,
} from '../lib/analyze'

// Next rung (ticket 037): the scan's surface. The gap report itself — band
// table, per-100 rates, the two rules no table covers — lives in lib/gaps.ts
// so the selftest can reach it; this file scans, renders and deep-links.

// short nouns for the "already at pace" footer — the row titles are imperatives
const LABEL: Record<string, string> = {
  blunders: 'blunders',
  mistakes: 'mistakes',
  accuracy: 'accuracy',
  book: 'out of book',
  convert: 'converting',
}

const fresh = (a: Analysis | undefined) => !!a && a.v === ANALYSIS_V && a.ms >= MOVE_MS

export function NextRung({
  lines,
  ms,
  onGo,
  onExit,
}: {
  lines: Line[]
  ms: Milestone | null
  onGo: (mode: Pick['mode'], focusLine?: string, ownOnly?: boolean) => void
  onExit: () => void
}) {
  const [games, setGames] = useState<FullGame[]>([])
  const [done, setDone] = useState<Record<string, Analysis>>({})
  const [busy, setBusy] = useState<{ k: number; of: number; done: number; total: number } | null>(null)
  const [prose, setProse] = useState('')
  const [err, setErr] = useState('')
  const storeRef = useRef<AnalysisStore>({ games: {} })
  const engRef = useRef<Engine | null>(null)
  const openingsRef = useRef<Openings | null>(null)

  useEffect(() => {
    ;(async () => {
      const months: string[] = await fetch('/api/data/archives').then((r) => (r.ok ? r.json() : []))
      const pool: FullGame[] = []
      // newest month first, stop once SCAN_N are in hand — no reason to read
      // four years of archives to look at ten games
      for (const m of [...months].sort().reverse()) {
        const j = await fetch('/api/data/archives/' + m).then((r) => (r.ok ? r.json() : { games: [] }))
        pool.push(
          ...((j.games ?? []) as FullGame[]).filter(
            (g) => g.rules === 'chess' && g.rated && (!ms || g.time_class === ms.timeClass),
          ),
        )
        if (pool.length >= SCAN_N) break
      }
      const last = pool.sort((a, b) => b.end_time - a.end_time).slice(0, SCAN_N)
      storeRef.current = await loadAnalyses()
      const have: Record<string, Analysis> = {}
      for (const g of last) if (fresh(storeRef.current.games[g.uuid])) have[g.uuid] = storeRef.current.games[g.uuid]
      setGames(last)
      setDone(have)
    })().catch(() => setErr('Could not load archives — is npm run dev serving /api/data?'))
    return () => engRef.current?.quit()
  }, [ms])

  const missing = games.filter((g) => !done[g.uuid])
  const scanned = games.filter((g) => done[g.uuid]).map((g) => ({ game: g as Game, a: done[g.uuid] }))
  // Nothing below the next rung? Measure against the one after it — the band
  // table flattens under 600, so at his end of the ladder an empty report is a
  // clamping artefact, not news. The rung actually measured is labelled.
  let against = ms?.next ?? 0
  let rep = ms && scanned.length ? gapReport(scanned, against) : null
  if (rep && ms)
    for (const m of MILESTONES.filter((x) => x > ms.next)) {
      if (rep.gaps.length) break
      against = m
      rep = gapReport(scanned, m)
    }
  const sig = rep ? `${against}:${rep.n}:${rep.gaps[0]?.key ?? 'none'}` : ''

  // the voice phrases the top gap; without it the gap rows stand on their own
  useEffect(() => {
    if (!rep || !ms || !rep.gaps.length || busy) return
    let dead = false
    void coachPitch(
      `gap:${sig}`,
      `His ${ms.timeClass} rating is ${ms.rating}, ${ms.next - ms.rating} points short of the next milestone ${ms.next}` +
        (against === ms.next ? '.' : `, and his last games already clear it — these numbers are measured against ${against}.`),
      // ponytail: only the failing rows go to the voice — feeding it the met
      // ones too had the 8B model mixing the two sets of numbers up
      { title: rep.gaps[0].title, evidence: rep.gaps.map((g) => g.detail) },
    ).then((t) => {
      if (!dead && t) setProse(t)
    })
    return () => {
      dead = true
    }
  }, [sig, busy])

  async function scan() {
    if (busy) return
    setErr('')
    const todo = missing
    const openings = (openingsRef.current ??= await loadOpenings())
    const eng = (engRef.current ??= startEngine())
    for (let k = 0; k < todo.length; k++) {
      const g = todo[k]
      setBusy({ k: k + 1, of: todo.length, done: 0, total: 1 })
      try {
        const a = await analyzeGame(g, lines, openings, eng, (d, total) =>
          setBusy({ k: k + 1, of: todo.length, done: d, total }),
        )
        storeRef.current.games[g.uuid] = a
        saveAnalyses(storeRef.current)
        setDone((s) => ({ ...s, [g.uuid]: a }))
      } catch {
        setErr('The engine gave up on one game — the report covers the rest.')
      }
    }
    setBusy(null)
  }

  const pace =
    !ms || ms.trend === 0
      ? `flat over your last ${TREND_N}`
      : ms.trend > 0
        ? `+${ms.trend} last ${TREND_N} — about ${Math.ceil(((ms.next - ms.rating) / ms.trend) * TREND_N)} games at this pace`
        : `${ms.trend} last ${TREND_N} — the pace has to turn first`

  return (
    <>
      <ModeHead
        title="Next rung"
        sub={
          ms
            ? `your last ${SCAN_N} rated ${ms.timeClass} games, measured against ${against}`
            : 'no rated games synced yet'
        }
        right={games.length ? <span className="badge">{scanned.length}/{games.length} scanned</span> : undefined}
        onExit={onExit}
      />
      {ms && (
        <section className="climb">
          <div className="climbnow">
            <span className="rating">{ms.rating}</span>
            <span className="eyebrow">
              {ms.next - ms.rating} points to {ms.next}
            </span>
            <span className={`trend${ms.trend < 0 ? ' down' : ''}`}>{pace}</span>
          </div>
        </section>
      )}
      {err && <p className="bad">{err}</p>}
      {rep && (
        <div className="coachcard">
          <span className="coachmark" aria-hidden="true">
            ?
          </span>
          <p className="coachprose">
            {prose ||
              (rep.gaps.length
                ? rep.gaps[0].detail
                : `nothing in these ${rep.n} games is below ${against} standard — the gap is games played, not skill`)}
          </p>
          {against !== ms!.next && rep.gaps.length > 0 && (
            <span className="tiny dim">
              these {rep.n} games already clear {ms!.next} — this is what {against} takes
            </span>
          )}
        </div>
      )}
      {rep && rep.met.length > 0 && (
        <p className="tiny dim">
          already at {against} pace: {rep.met.map((g) => `${LABEL[g.key]} ${g.mine} (${g.want})`).join(' · ')}
        </p>
      )}
      {rep && (
        <div className="ledger">
          {rep.gaps.map((g) => (
            <button key={g.key} className="row" onClick={() => onGo(g.mode, g.focusLine, g.ownOnly)}>
              <span className="name">{g.title}</span>
              <span className="what">{g.detail}</span>
              {/* his number in flag red — brass is for what he's earned (021) */}
              <span className="stat">
                <span className="bad">{g.mine}</span> vs {g.want}
              </span>
            </button>
          ))}
        </div>
      )}
      {busy ? (
        <p className="dim">
          scanning game {busy.k} of {busy.of} — position {busy.done}/{busy.total}…
        </p>
      ) : missing.length ? (
        <button className="coachgo" onClick={scan}>
          Scan the {missing.length} unanalyzed game{missing.length === 1 ? '' : 's'} (~
          {Math.ceil((missing.length * 80 * MOVE_MS) / 1000)}s) →
        </button>
      ) : games.length === 0 ? (
        <p className="dim">no rated games in the archives yet</p>
      ) : null}
    </>
  )
}
