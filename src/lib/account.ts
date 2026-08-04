// Per-account chess.com username used for syncing (multi-account: each
// Cloudflare Access login gets its own isolated data, ticket ???).
// ponytail: prompt() instead of a settings page — add one if this needs to
// be editable later, or a second site (lichess) needs supporting.

interface Settings {
  chessUsername?: string
}

export async function resolveChessUsername(): Promise<string> {
  const r = await fetch('/api/data/settings')
  const s: Settings = r.ok ? await r.json() : {}
  if (s.chessUsername) return s.chessUsername

  const entered = window.prompt('Your chess.com username, for syncing your games:')?.trim().toLowerCase()
  if (!entered) return ''
  void fetch('/api/data/settings', {
    method: 'PUT',
    body: JSON.stringify({ ...s, chessUsername: entered }),
  })
  return entered
}
