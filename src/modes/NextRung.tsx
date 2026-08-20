import { useEffect, useRef, useState } from 'react'
import { ModeHead } from '../components/ModeHead'
import { coachPitch } from '../lib/coach'
import { startEngine, type Engine } from '../lib/engine'
import { loadOpenings, type Openings } from '../lib/openings'
import type { Line } from '../lib/pgn'
import { MILESTONES, TREND_N, type Milestone, type Pick } from '../lib/recommend'
import { gameParts, type Game } from '../lib/sync'
import {
  ANALYSIS_V,
  MOVE_MS,
  analyzeGame,
  loadAnalyses,
  saveAnalyses,
  winPct,
  type Analysis,
  type AnalysisStore,
  type FullGame,
  type Tag,
} from '../lib/analyze'

// Next rung (ticket 037): scan his last SCAN_N rated games in the milestone's
// time class and say what separates them from the next rung — measured, not
// vibes. Same split as the rest of the coach (ADR 0001): this file computes the
// gaps and their numbers, the LLM only phrases the top one.
export const SCAN_N = 10

// What a player at a given rating produces per 100 of his own moves. Per
// *game* was the obvious unit and it's the wrong one: his games end in 8 moves
// as often as 80, and a player who is already lost can't drop another 30 win%,
// so bad games under-count. Accuracy is lichess's open formula (analyze.ts),
// which runs a few points under chess.com's CAPS.
// ponytail: the 400 rung is measured off his own archives (11 analyzed games at
// rating ~390: 72% accuracy, 3.6 blunders and 5.1 mistakes per 100 moves); the
// climb from there to 2200 is a plausible monotone guess. Refit any rung the
// same way once there are games at it.
const BANDS = [
  { rating: 400, acc: 71, blunders: 3.6, mistakes: 5.2 },
  { rating: 600, acc: 73, blunders: 3.0, mistakes: 4.5 },
  { rating: 800, acc: 75, blunders: 2.4, mistakes: 3.8 },
  { rating: 1000, acc: 77, blunders: 1.9, mistakes: 3.2 },
  { rating: 1200, acc: 79, blunders: 1.4, mistakes: 2.6 },
  { rating: 1400, acc: 81, blunders: 1.1, mistakes: 2.1 },
  { rating: 1600, acc: 83, blunders: 0.8, mistakes: 1.7 },
  { rating: 1800, acc: 85, blunders: 0.6, mistakes: 1.4 },
  { rating: 2000, acc: 87, blunders: 0.4, mistakes: 1.1 },
  { rating: 2200, acc: 89, blunders: 0.3, mistakes: 0.9 },
]

export function bandTarget(rating: number): { acc: number; blunders: number; mistakes: number } {
  let hi = BANDS.findIndex((b) => b.rating >= rating)
  if (hi < 0) hi = BANDS.length - 1 // above the table — hold the top band
  if (hi === 0) hi = 1
  const [a, b] = [BANDS[hi - 1], BANDS[hi]]
  const t = Math.max(0, Math.min(1, (rating - a.rating) / (b.rating - a.rating)))
  const mix = (x: number, y: number) => x + (y - x) * t
  return {
    acc: mix(a.acc, b.acc),
    blunders: mix(a.blunders, b.blunders),
    mistakes: mix(a.mistakes, b.mistakes),
  }
}

// Knobs for the two gaps no band table covers.
export const BOOK_SHARE = 0.5 // out of book in more than half the games = a gap
export const WINNING_WIN = 80 // his win% that counts as "you were winning"
export const CONVERT_RATE = 0.7 // and this share of those has to end in a win

export interface Gap {
  key: string // also the footer's short label, see LABEL
  title: string
  detail: string // the sentence, also the evidence line fed to the voice
  mine: string // his number
  want: string // the number the rung wants, comparator included
  score: number // relative shortfall — ranks the list
  mode: Pick['mode'] // deep-link, same targets the coach card uses
  focusLine?: string
  ownOnly?: boolean
}

export interface Report {
  n: number
  acc: number
  gaps: Gap[] // below the rung, worst shortfall first — what he's missing
  met: Gap[] // already at rung pace, shown as a footer so the whole scan is visible
}

export function gapReport(scanned: { game: Game; a: Analysis }[], next: number): Report {
  const n = scanned.length
  const t = bandTarget(next)
  // judged runs both players — his plies are the ones his color moved on
  const mine = (a: Analysis) => a.judged.filter((_, i) => (i % 2 === 0 ? 'w' : 'b') === a.color)
  const moves = scanned.map(({ a }) => mine(a).length)
  const total = moves.reduce((x, y) => x + y, 0) || 1
  // both rates are pooled over moves, and accuracy is weighted the same way —
  // a two-move loss shouldn't count as much as an 80-move grind
  const acc = scanned.reduce((s, { a }, i) => s + a.acc[a.color] * moves[i], 0) / total
  const per100 = (tags: Tag[]) =>
    (100 * scanned.reduce((s, { a }) => s + mine(a).filter((j) => tags.includes(j.tag)).length, 0)) / total
  const blunders = per100(['blunder'])
  const mistakes = per100(['mistake', 'miss'])

  const all: Gap[] = []
  const add = (g: Gap) => all.push(g)

  add({
    key: 'blunders',
    title: 'Stop hanging pieces',
    detail: `you blunder ${blunders.toFixed(1)} times per 100 moves; a ${next}-rated player blunders about ${t.blunders.toFixed(1)} times per 100 moves`,
    mine: `${blunders.toFixed(1)}/100`,
    want: `≤${t.blunders.toFixed(1)}`,
    score: (blunders - t.blunders) / Math.max(0.3, t.blunders),
    mode: 'puzzles',
    ownOnly: true,
  })
  add({
    key: 'mistakes',
    title: 'Cut the mistakes',
    detail: `you make ${mistakes.toFixed(1)} mistakes per 100 moves; a ${next}-rated player makes about ${t.mistakes.toFixed(1)}`,
    mine: `${mistakes.toFixed(1)}/100`,
    want: `≤${t.mistakes.toFixed(1)}`,
    score: (mistakes - t.mistakes) / Math.max(0.3, t.mistakes),
    mode: 'puzzles',
    ownOnly: true,
  })
  add({
    key: 'accuracy',
    title: 'Play cleaner all game',
    detail: `your moves average ${acc.toFixed(0)}% accuracy; a ${next}-rated player averages about ${t.acc.toFixed(0)}%`,
    mine: `${acc.toFixed(0)}%`,
    want: `≥${t.acc.toFixed(0)}%`,
    score: (t.acc - acc) / t.acc,
    mode: 'puzzles',
    ownOnly: true,
  })

  // out of book: no line matched at all, or he was the one who left it
  const out = scanned.filter(({ a }) => !a.book || (a.book.by === 'me' && a.book.leftAtPly !== null))
  const share = out.length / (n || 1)
  const byLine: Record<string, number> = {}
  for (const { a } of out) if (a.book) byLine[a.book.line] = (byLine[a.book.line] ?? 0) + 1
  const worstLine = Object.entries(byLine).sort((x, y) => y[1] - x[1])[0]
  add({
    key: 'book',
    title: worstLine ? `Know "${worstLine[0]}" deeper` : 'Play your repertoire',
    detail: `${out.length} of ${n} games left your repertoire early or never matched it`,
    mine: `${Math.round(share * 100)}%`,
    want: `≤${Math.round(BOOK_SHARE * 100)}%`,
    score: (share - BOOK_SHARE) / BOOK_SHARE,
    mode: 'lines',
    focusLine: worstLine?.[0],
  })

  // conversion: he reached a winning position and didn't take the point
  const peak = (a: Analysis) =>
    a.evals.length ? Math.max(...a.evals.map((cp) => (a.color === 'w' ? winPct(cp) : 100 - winPct(cp)))) : 0
  const winning = scanned.filter(({ a }) => peak(a) >= WINNING_WIN)
  const kept = winning.filter(({ game }) => gameParts(game).cls === 'win').length
  const rate = kept / (winning.length || 1)
  if (winning.length >= 3)
    add({
      key: 'convert',
      title: 'Convert winning positions',
      detail: `you were winning in ${winning.length} of ${n} games and won ${kept} of them`,
      mine: `${Math.round(rate * 100)}%`,
      want: `≥${Math.round(CONVERT_RATE * 100)}%`,
      score: (CONVERT_RATE - rate) / CONVERT_RATE,
      mode: 'analysis',
    })

  // ponytail: one shared scale (shortfall / target) ranks unlike metrics — good
  // enough to order four rows, not a model of what costs the most rating.
  all.sort((x, y) => y.score - x.score)
  return { n, acc, gaps: all.filter((g) => g.score > 0), met: all.filter((g) => g.score <= 0) }
}

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
