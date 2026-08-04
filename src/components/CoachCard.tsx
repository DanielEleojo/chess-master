import { useEffect, useState } from 'react'
import { loadAnalyses } from '../lib/analyze'
import { coachPitch } from '../lib/coach'
import { startEngine } from '../lib/engine'
import {
  acceptExtension,
  loadExt,
  proposeMoves,
  saveExt,
  type ExtStore,
} from '../lib/extend'
import type { History } from '../lib/history'
import type { Line } from '../lib/pgn'
import { milestone, pickNext, ratingHistory, type Milestone, type Pick } from '../lib/recommend'
import type { Game } from '../lib/sync'

// "5... Nc6 6. Bc4 …" — number the proposed plies from the break onward
const fmtPlies = (ply: number, sans: string[]) =>
  sans
    .map((s, k) => {
      const j = ply + k
      return (j % 2 === 0 ? `${j / 2 + 1}. ` : k === 0 ? `${Math.floor(j / 2) + 1}… ` : '') + s
    })
    .join(' ')

// "Coach says" (ticket 018): the home card. Code picks and evidences (recommend.ts),
// the voice phrases; without Ollama the pick + evidence stand alone as plain text.
// Extend picks (020) render the proposed plies with one-click accept/dismiss.
export function CoachCard({
  history,
  unseen,
  lines,
  onGo,
}: {
  history: History
  unseen: number
  lines: Line[]
  onGo: (mode: Pick['mode'], focusLine?: string, ownOnly?: boolean) => void
}) {
  const [pick, setPick] = useState<Pick | null>(null)
  const [ms, setMs] = useState<Milestone | null>(null)
  const [prose, setProse] = useState('')
  const [ext, setExt] = useState<ExtStore | null>(null)
  const [proposal, setProposal] = useState<string[] | null>(null)
  const [err, setErr] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let dead = false
    ;(async () => {
      const [analyses, months, extStore] = await Promise.all([
        loadAnalyses(),
        fetch('/api/data/archives')
          .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
          .catch(() => [] as string[]),
        loadExt(),
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
      const p = pickNext(unseen, Object.values(analyses.games), history, extStore)
      setMs(m)
      setPick(p)
      setExt(extStore)
      if (p.kind === 'extend' && p.ext) {
        const l = lines.find((x) => x.name === p.ext!.line)
        if (l) {
          const eng = startEngine()
          try {
            const sans = await proposeMoves(l, p.ext, eng)
            if (!dead) setProposal(sans)
          } finally {
            eng.quit()
          }
        }
      }
      const mLine = m
        ? `His ${m.timeClass} rating is ${m.rating} over ${m.games} games; the next milestone is ${m.next}.`
        : ''
      const text = await coachPitch(`pitch:${p.kind}:${p.title}:${unseen}`, mLine, p)
      if (!dead && text) setProse(text)
    })()
    return () => {
      dead = true
    }
  }, [history, unseen, lines, refresh])

  if (!pick)
    return (
      <div className="coachcard">
        <span className="badge gold">Coach says</span>
        <span className="tiny dim">looking at your games…</span>
      </div>
    )

  const accept = async () => {
    const t = pick.ext
    const l = t && lines.find((x) => x.name === t.line)
    if (!t || !l || !proposal || !ext) return
    try {
      await acceptExtension(l, t, proposal, ext)
      // ponytail: the repertoire is fetched once at boot — reload re-seeds everything
      location.reload()
    } catch {
      setErr('Could not write the extension — is npm run dev serving /api?')
    }
  }
  const dismiss = () => {
    const t = pick.ext
    if (!t || !ext) return
    ext.dismissed = ext.dismissed.filter(
      (d) => !(d.line === t.line && d.ply === t.ply && d.oppSan === t.oppSan),
    )
    ext.dismissed.push({ line: t.line, ply: t.ply, oppSan: t.oppSan, games: t.games })
    saveExt(ext)
    setPick(null)
    setProposal(null)
    setProse('')
    setRefresh((n) => n + 1) // re-pick without the dismissed break
  }

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
      {err && <div className="tiny bad">{err}</div>}
      {pick.kind === 'extend' && pick.ext ? (
        proposal ? (
          <div>
            <div className="coachprose">
              <b>{pick.title}:</b> {fmtPlies(pick.ext.ply, proposal)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="coachgo" onClick={accept}>
                Add to repertoire ✓
              </button>
              <button onClick={dismiss}>Not now</button>
            </div>
          </div>
        ) : (
          <div className="tiny dim">engine preparing the new moves…</div>
        )
      ) : (
        <button className="coachgo" onClick={() => onGo(pick.mode, pick.focusLine, pick.ownOnly)}>
          {pick.title} →
        </button>
      )}
    </div>
  )
}
