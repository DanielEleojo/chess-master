// Drill history — data/drill-history.json via the vite data middleware (ticket 004).

export interface Stat {
  seen: number
  missed: number
}

export interface SessionLog {
  mode: 'lines' | 'traps'
  at: string
  lines?: number
  moves?: number
  ok?: number
  bestStreak?: number
  cards?: number
  good?: number
}

export interface History {
  lines: Record<string, Stat>
  traps: Record<string, Stat>
  sessions: SessionLog[]
}

export const emptyHistory = (): History => ({ lines: {}, traps: {}, sessions: [] })

export async function loadHistory(): Promise<History> {
  try {
    const r = await fetch('/api/data/drill-history')
    if (!r.ok) return emptyHistory()
    return { ...emptyHistory(), ...(await r.json()) }
  } catch {
    return emptyHistory()
  }
}

export function saveHistory(h: History): void {
  void fetch('/api/data/drill-history', { method: 'PUT', body: JSON.stringify(h, null, 1) })
}

export function bump(rec: Record<string, Stat>, key: string, missed: boolean): void {
  const s = (rec[key] ??= { seen: 0, missed: 0 })
  s.seen++
  if (missed) s.missed++
}

// Weakest first: most-missed, then least-seen; shuffle breaks ties.
export function byWeakness<T>(items: T[], keyOf: (t: T) => string, rec: Record<string, Stat>): T[] {
  const stat = (t: T) => rec[keyOf(t)] ?? { seen: 0, missed: 0 }
  return [...items]
    .sort(() => Math.random() - 0.5)
    .sort((a, b) => stat(b).missed - stat(a).missed || stat(a).seen - stat(b).seen)
}
