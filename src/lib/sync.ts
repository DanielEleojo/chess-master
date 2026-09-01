// Live game sync (tickets 006/015) — poll the current UTC month archive on
// chess.com, diff by uuid, persist via the data middleware, surface arrivals.
// Plain fetch: the browser HTTP cache does the ETag 304 revalidation (004).

// Per-account chess.com username (multi-account): resolved at boot by
// account.ts and threaded to whatever needs it. It used to be a mutable
// module-level global that these functions read ambiently — which is what
// raced App's async resolution in ticket 028. Now "whose game is this?" is
// visible at every call site, and these three are genuinely pure.

export interface Game {
  uuid: string
  time_class: string
  rated?: boolean
  end_time?: number
  white: { username: string; result: string; rating?: number }
  black: { username: string; result: string; rating?: number }
  [k: string]: unknown
}

export const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

export const newGames = (stored: Game[], fetched: Game[]): Game[] => {
  const have = new Set(stored.map((g) => g.uuid))
  return fetched.filter((g) => !have.has(g.uuid))
}

const DRAWS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])

// His result in a game, crosstable-style: 1 won, 0 lost, ½ drew — plus the
// opponent, so the analysis list can column them instead of writing a sentence.
export function gameParts(g: Game, user: string) {
  const meWhite = g.white.username.toLowerCase() === user
  const me = meWhite ? g.white : g.black
  const cls = me.result === 'win' ? 'win' : DRAWS.has(me.result) ? 'draw' : 'loss'
  return {
    meWhite,
    opp: (meWhite ? g.black : g.white).username,
    cls: cls as 'win' | 'draw' | 'loss',
    mark: cls === 'win' ? '1' : cls === 'draw' ? '½' : '0',
  }
}

export function describeGame(g: Game, user: string): string {
  const meWhite = g.white.username.toLowerCase() === user
  const me = meWhite ? g.white : g.black
  const opp = meWhite ? g.black : g.white
  const verb = me.result === 'win' ? 'won' : DRAWS.has(me.result) ? 'drew' : 'lost'
  return `You ${verb} vs ${opp.username} · ${g.time_class}`
}

// data/sync-state.json — unseen uuids for the future analysis mode (016)
async function loadSyncState(): Promise<{ unseen: string[] }> {
  try {
    const r = await fetch('/api/data/sync-state')
    if (r.ok) {
      const s = await r.json()
      if (Array.isArray(s.unseen)) return s
    }
  } catch {
    /* fall through */
  }
  return { unseen: [] }
}

export interface SyncEvents {
  onArrivals(msgs: string[]): void
  onSynced(at: number): void
}

// Cadence per 006: 10s visible / 60s hidden / 5s burst for ~3 min after an arrival.
export function startSync(user: string, ev: SyncEvents): () => void {
  let stopped = false
  let busy = false
  let burstUntil = 0
  let timer: ReturnType<typeof setTimeout>

  const delay = () => (Date.now() < burstUntil ? 5_000 : document.hidden ? 60_000 : 10_000)

  async function tick() {
    if (busy) return
    busy = true
    try {
      const month = monthKey(new Date())
      const r = await fetch(
        `https://api.chess.com/pub/player/${user}/games/${month.replace('-', '/')}`,
      )
      if (r.ok) {
        const fetched: Game[] = (await r.json()).games ?? []
        const sr = await fetch(`/api/data/archives/${month}`)
        const stored: Game[] = sr.ok ? ((await sr.json()).games ?? []) : []
        const fresh = newGames(stored, fetched)
        // stopped mid-flight (StrictMode remount, mode exit): skip side effects
        if (stopped) return
        if (fresh.length) {
          await fetch(`/api/data/archives/${month}`, {
            method: 'PUT',
            body: JSON.stringify({ games: [...stored, ...fresh] }, null, 1),
          })
          const st = await loadSyncState()
          st.unseen = [...new Set([...st.unseen, ...fresh.map((g) => g.uuid)])]
          void fetch('/api/data/sync-state', {
            method: 'PUT',
            body: JSON.stringify(st, null, 1),
          })
          burstUntil = Date.now() + 3 * 60_000
          ev.onArrivals(
            // ponytail: cap the backlog case (app closed for days) at one summary toast
            fresh.length > 3 ? [`${fresh.length} new games synced`] : fresh.map((g) => describeGame(g, user)),
          )
        }
        ev.onSynced(Date.now())
      }
    } catch {
      /* offline or api hiccup — next tick retries */
    }
    busy = false
    if (!stopped) timer = setTimeout(tick, delay())
  }

  const onVis = () => {
    if (!document.hidden && !busy) {
      clearTimeout(timer)
      void tick() // back to the tab: sync now, not in up to 60s
    }
  }
  document.addEventListener('visibilitychange', onVis)
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVis)
  }
}
