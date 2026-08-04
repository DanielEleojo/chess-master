// Line extension (tickets 019/020): when real games keep hitting the same
// break in a repertoire line, the coach proposes concrete new plies — the
// opponent's actually-played move plus deeper-Stockfish replies — and only an
// explicit accept writes them into data/repertoire.pgn (git-tracked, so every
// extension is an inspectable diff). Dismissals sleep until new evidence.
import { Chess } from 'chess.js'
import type { Analysis } from './analyze'
import type { Engine } from './engine'
import { parseGames, type Line } from './pgn'

// Knobs, alongside 018's thresholds.
export const EXTEND_MIN = 2 // same break seen in ≥2 analyzed games
export const EXTEND_PLIES = 4 // their move, his reply, expected follow-up, his reply
export const EXTEND_MS = 1500 // engine time per proposed ply — deeper than analysis's 300ms

export interface ExtTrigger {
  line: string
  ply: number // break ply: opp's deviation ply for a branch, old line length for a tail
  oppSan: string | null // opponent's actually-played move at the break
  kind: 'branch' | 'tail'
  games: number // analyzed games hitting this exact break
}

// data/extensions.json via the data middleware (004)
export interface ExtStore {
  dismissed: { line: string; ply: number; oppSan: string | null; games: number }[]
  preLen: Record<string, number> // line -> plies before its extension (012 grace on the tail)
}

export const emptyExt = (): ExtStore => ({ dismissed: [], preLen: {} })

export async function loadExt(): Promise<ExtStore> {
  try {
    const r = await fetch('/api/data/extensions')
    if (r.ok) return { ...emptyExt(), ...(await r.json()) }
  } catch {
    /* fall through */
  }
  return emptyExt()
}

export function saveExt(s: ExtStore): void {
  void fetch('/api/data/extensions', { method: 'PUT', body: JSON.stringify(s, null, 1) })
}

// The 019 triggers, split by cause: opp-left the same break ≥2× → branch;
// game outlived the line ≥2× → tail. (Daniel-left stays 018's re-drill rung.)
// ponytail: grouped by exact break (line+ply+move), which also matches the
// dismissal key — pool same-line near-misses only if evidence demands it.
export function findExtension(analyses: Analysis[], ext: ExtStore): ExtTrigger | null {
  const groups: Record<string, ExtTrigger> = {}
  for (const a of analyses) {
    const b = a.book
    if (!b) continue
    let t: ExtTrigger | null = null
    if (b.by === 'opp' && b.leftAtPly !== null && b.oppSan)
      t = { line: b.line, ply: b.leftAtPly, oppSan: b.oppSan, kind: 'branch', games: 0 }
    else if (b.outlived)
      t = { line: b.line, ply: b.matchedPlies, oppSan: b.oppSan ?? null, kind: 'tail', games: 0 }
    if (!t) continue
    ;(groups[`${t.line}|${t.ply}|${t.oppSan}`] ??= t).games++
  }
  return (
    Object.values(groups)
      .filter((t) => t.games >= EXTEND_MIN)
      .filter((t) => {
        const d = ext.dismissed.find(
          (d) => d.line === t.line && d.ply === t.ply && d.oppSan === t.oppSan,
        )
        return !d || t.games > d.games // dismissed sleeps until a new game re-hits the break
      })
      .sort((a, b) => b.games - a.games)[0] ?? null
  )
}

// Concrete plies for the proposal: the opponent's real move first (when the
// break is on their turn), then engine-best moves for both sides in turn.
export async function proposeMoves(line: Line, t: ExtTrigger, engine: Engine): Promise<string[]> {
  const c = new Chess()
  for (let j = 0; j < t.ply; j++) c.move(line.moves[j].san)
  const sans: string[] = []
  for (let k = 0; k < EXTEND_PLIES; k++) {
    if (k === 0 && t.oppSan) {
      sans.push(c.move(t.oppSan).san)
      continue
    }
    const s = await engine.evalFen(c.fen(), EXTEND_MS)
    if (!s.best) break // game over — the extension ends here
    sans.push(c.move({ from: s.best.slice(0, 2), to: s.best.slice(2, 4), promotion: 'q' }).san)
  }
  return sans
}

export const extName = (line: Line, t: ExtTrigger, sans: string[]): string =>
  t.kind === 'tail' ? line.name : `${line.name} (${sans[0]} branch)`

// New repertoire.pgn text: a tail rewrites the line's chunk in place, a branch
// appends a new game sharing the prefix. Pure string→string — selftest walks it.
export function applyExtension(raw: string, line: Line, t: ExtTrigger, sans: string[]): string {
  const c = new Chess()
  for (const m of line.moves.slice(0, t.kind === 'tail' ? line.moves.length : t.ply)) {
    c.move(m.san)
    const cm = line.comments[m.after]
    if (cm) c.setComment(cm)
  }
  const uc = line.trainAs === 'White' ? 'w' : 'b'
  for (const san of sans) {
    const mv = c.move(san)
    // every drilled user move needs a why (011 selftest rule) — name the trigger
    if (mv.color === uc) c.setComment(`coach extension — engine's best after ${sans[0]}`)
  }
  c.setHeader('Event', `Repertoire: ${extName(line, t, sans)}`)
  c.setHeader('System', line.system)
  c.setHeader('TrainAs', line.trainAs)
  c.setHeader('Result', '*')
  let chunk = c.pgn()
  if (!chunk.trimEnd().endsWith('*')) chunk = chunk.trimEnd() + ' *'
  const chunks = raw.trim().split(/\n\s*\n(?=\[Event )/) // same split parseGames uses
  if (t.kind === 'tail') chunks[line.idx] = chunk
  else chunks.push(chunk)
  return chunks.join('\n\n') + '\n'
}

// One-click accept: rewrite the PGN (validated by re-parsing before the PUT),
// persist via the dev middleware, remember the pre-extension length for grace.
export async function acceptExtension(
  line: Line,
  t: ExtTrigger,
  sans: string[],
  ext: ExtStore,
): Promise<void> {
  const raw = await (await fetch('/data/repertoire.pgn')).text()
  const next = applyExtension(raw, line, t, sans)
  if (parseGames(next).length < parseGames(raw).length) throw new Error('extension broke the pgn')
  const r = await fetch('/api/repertoire', { method: 'PUT', body: next })
  if (!r.ok) throw new Error('save failed')
  ext.preLen[extName(line, t, sans)] = t.ply
  // the triggering analyses keep their old book info — park the break like a
  // dismissal so it can't re-propose; new games now match the extended line
  ext.dismissed = ext.dismissed.filter(
    (d) => !(d.line === t.line && d.ply === t.ply && d.oppSan === t.oppSan),
  )
  ext.dismissed.push({ line: t.line, ply: t.ply, oppSan: t.oppSan, games: t.games })
  saveExt(ext)
}

// 012 grace on the new tail: the first miss landing entirely beyond the
// pre-extension length is unrecorded, once; firing consumes the entry.
// Caller saves the store when this returns true.
export function tailGrace(ext: ExtStore, name: string, minMissPly: number): boolean {
  const pre = ext.preLen[name]
  if (pre === undefined || minMissPly < pre) return false
  delete ext.preLen[name]
  return true
}
