import { useEffect, useState } from 'react'
import { loadAnalyses } from '../lib/analyze'
import { coachPitch } from '../lib/coach'
import type { History } from '../lib/history'
import { milestone, pickNext, ratingHistory, type Milestone, type Pick } from '../lib/recommend'
import type { Game } from '../lib/sync'

// "Coach says" (ticket 018): the home card. Code picks and evidences (recommend.ts),
// the voice phrases; without Ollama the pick + evidence stand alone as plain text.
export function CoachCard({
  history,
  unseen,
  onGo,
}: {
  history: History
  unseen: number
  onGo: (mode: Pick['mode'], focusLine?: string) => void
}) {
  const [pick, setPick] = useState<Pick | null>(null)
  const [ms, setMs] = useState<Milestone | null>(null)
  const [prose, setProse] = useState('')

  useEffect(() => {
    let dead = false
    ;(async () => {
      const [analyses, months] = await Promise.all([
        loadAnalyses(),
        fetch('/api/data/archives')
          .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
          .catch(() => [] as string[]),
      ])
      const games: Game[] = (
        await Promise.all(
          months.map((m) =>
            fetch(`/api/data/archives/${m}`)
              .then((r) => (r.ok ? r.json() : { games: [] }))
              .catch(() => ({ games: [] })),
          ),
        )
      ).flatMap((a) => a.games ?? [])
      if (dead) return
      const m = milestone(ratingHistory(games))
      const p = pickNext(unseen, Object.values(analyses.games), history)
      setMs(m)
      setPick(p)
      const mLine = m
        ? `His ${m.timeClass} rating is ${m.rating} over ${m.games} games; the next milestone is ${m.next}.`
        : ''
      const text = await coachPitch(`pitch:${p.kind}:${p.title}:${unseen}`, mLine, p)
      if (!dead && text) setProse(text)
    })()
    return () => {
      dead = true
    }
  }, [history, unseen])

  if (!pick)
    return (
      <div className="coachcard">
        <span className="badge gold">Coach says</span>
        <span className="tiny dim">looking at your games…</span>
      </div>
    )
  const trend = ms && ms.trend !== 0 ? ` · ${ms.trend > 0 ? '+' : ''}${ms.trend} recent` : ''
  return (
    <div className="coachcard">
      <div className="coachhead">
        <span className="badge gold">Coach says</span>
        {ms && (
          <span className="tiny dim">
            {ms.timeClass} {ms.rating} → next stop {ms.next}
            {trend}
          </span>
        )}
      </div>
      {prose && <p className="coachprose">{prose}</p>}
      <ul className="coachwhy">
        {pick.evidence.map((e) => (
          <li key={e} className="tiny dim">
            {e}
          </li>
        ))}
      </ul>
      <button className="coachgo" onClick={() => onGo(pick.mode, pick.focusLine)}>
        {pick.title} →
      </button>
    </div>
  )
}
