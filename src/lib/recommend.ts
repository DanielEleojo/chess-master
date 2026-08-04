// Coach recommender (ticket 018, ADR 0001): a deterministic priority ladder
// picks what to practice next — unanalyzed games → a line he keeps leaving →
// blunder clusters → weakest drill stat — and the milestone ladder reads his
// real ratings from the synced archives. Every pick carries its evidence; the
// LLM voice (coach.ts) only phrases what this file decides.
import type { Analysis } from './analyze'
import { emptyExt, findExtension, type ExtStore, type ExtTrigger } from './extend'
import type { History, Stat } from './history'
import { USER, type Game } from './sync'

// Weakness knobs — how many repeats before the coach calls it (018's open question).
export const LEFT_LINE_MIN = 2 // left the same line early in ≥2 analyzed games
export const CLUSTER_MIN = 3 // ≥3 flagged moves land in the same game phase
export const WEAK_STAT_MIN = 2 // ≥2 recorded misses at ≥1/3 miss rate

export interface Pick {
  kind: 'new-games' | 'left-line' | 'extend' | 'blunder-cluster' | 'weak-drill' | 'default'
  mode: 'analysis' | 'lines' | 'traps' | 'puzzles'
  title: string
  evidence: string[] // the facts backing the pick — shown raw, fed to the voice
  focusLine?: string // line drill deals this line first
  ownOnly?: boolean // tactics deals only his own flagged positions (013)
  ext?: ExtTrigger // extend picks: the break to propose plies for (019/020)
}

export function pickNext(
  unseen: number,
  analyses: Analysis[],
  h: History,
  ext: ExtStore = emptyExt(),
): Pick {
  if (unseen > 0)
    return {
      kind: 'new-games',
      mode: 'analysis',
      title: unseen === 1 ? 'Analyze your new game' : `Analyze your ${unseen} new games`,
      evidence: [`${unseen} synced game${unseen === 1 ? '' : 's'} you haven't reviewed — fresh mistakes coach best`],
    }

  // a line he keeps leaving early (016's left-book signal)
  const left: Record<string, { n: number; ply: number; expected: string | null }> = {}
  for (const a of analyses) {
    const b = a.book
    if (!b || b.by !== 'me' || b.leftAtPly === null) continue
    const e = (left[b.line] ??= { n: 0, ply: 0, expected: null })
    e.n++
    e.ply = b.leftAtPly
    e.expected = b.expectedSan
  }
  const worstLeft = Object.entries(left).sort((a, b) => b[1].n - a[1].n)[0]
  if (worstLeft && worstLeft[1].n >= LEFT_LINE_MIN) {
    const [line, e] = worstLeft
    return {
      kind: 'left-line',
      mode: 'lines',
      focusLine: line,
      title: `Re-drill "${line}"`,
      evidence: [
        `you left this line early in ${e.n} of ${analyses.length} analyzed games`,
        `around move ${Math.floor(e.ply / 2) + 1} the line wants ${e.expected ?? 'a different move'}`,
      ],
    }
  }

  // a break the repertoire keeps hitting (019/020): propose growing the line
  const ex = findExtension(analyses, ext)
  if (ex) {
    const mv = Math.floor(ex.ply / 2) + 1
    return {
      kind: 'extend',
      mode: 'lines',
      focusLine: ex.line,
      title:
        ex.kind === 'branch'
          ? `Extend "${ex.line}" to cover ${ex.oppSan}`
          : `Extend "${ex.line}" — it ends too early`,
      evidence:
        ex.kind === 'branch'
          ? [
              `opponents met move ${mv} of this line with ${ex.oppSan} in ${ex.games} analyzed games — your book has no answer`,
            ]
          : [`${ex.games} analyzed games matched this line to its end and kept going`],
      ext: ex,
    }
  }

  // blunder clusters by game phase
  const flagged = analyses.flatMap((a) => a.blunders)
  const phase = (ply: number) => (ply < 16 ? 'opening' : ply < 40 ? 'middlegame' : 'endgame')
  const clusters: Record<string, number> = {}
  for (const b of flagged) clusters[phase(b.ply)] = (clusters[phase(b.ply)] ?? 0) + 1
  const worstCluster = Object.entries(clusters).sort((a, b) => b[1] - a[1])[0]
  if (worstCluster && worstCluster[1] >= CLUSTER_MIN) {
    const [ph, n] = worstCluster
    return {
      kind: 'blunder-cluster',
      // opening clusters are a repertoire problem → drill the lines; the rest is
      // tactics, so 013 deals those exact positions back as cards.
      mode: ph === 'opening' ? 'lines' : 'puzzles',
      ownOnly: ph !== 'opening',
      title: ph === 'opening' ? 'Tighten your opening moves' : `Redo your ${ph} blunders`,
      evidence: [`${n} of your ${flagged.length} flagged moves come in the ${ph}`],
    }
  }

  // weakest drill/trap stat
  const weak = (rec: Record<string, Stat>, mode: 'lines' | 'traps' | 'puzzles') =>
    Object.entries(rec)
      .filter(([, s]) => s.missed >= WEAK_STAT_MIN && s.missed / s.seen >= 1 / 3)
      .map(([name, s]) => ({ name, s, mode, rate: s.missed / s.seen }))
  const worstStat = [
    ...weak(h.lines, 'lines'),
    ...weak(h.traps, 'traps'),
    ...weak(h.puzzles, 'puzzles'),
  ].sort((a, b) => b.rate - a.rate)[0]
  if (worstStat)
    return {
      kind: 'weak-drill',
      mode: worstStat.mode,
      focusLine: worstStat.mode === 'lines' ? worstStat.name : undefined,
      title:
        worstStat.mode === 'lines'
          ? `Re-drill "${worstStat.name}"`
          : worstStat.mode === 'traps'
            ? 'Deal the trap cards'
            : 'Deal the tactics cards',
      evidence: [`"${worstStat.name}": missed ${worstStat.s.missed} of ${worstStat.s.seen} recorded attempts`],
    }

  return {
    kind: 'default',
    mode: 'lines',
    title: 'Drill your repertoire',
    evidence: ['no standout weakness in the data yet — reps build the base'],
  }
}

// --- milestone ladder ---------------------------------------------------

export const MILESTONES = [400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2200]
export const TREND_N = 10 // trend window in games

export interface RatingPoint {
  t: number
  rating: number
}

// Daniel's post-game rating per rated game, split by time class, oldest first.
// The archive JSON's white/black.rating is the same number the PGN's
// WhiteElo/BlackElo headers carry — no PGN parsing needed.
export function ratingHistory(games: Game[]): Record<string, RatingPoint[]> {
  const by: Record<string, RatingPoint[]> = {}
  for (const g of games) {
    const me = g.white.username.toLowerCase() === USER ? g.white : g.black
    if (!g.rated || typeof me.rating !== 'number') continue
    ;(by[g.time_class] ??= []).push({ t: g.end_time ?? 0, rating: me.rating })
  }
  for (const k in by) by[k].sort((a, b) => a.t - b.t)
  return by
}

export interface Milestone {
  timeClass: string // his most-played class — the headline number
  rating: number // latest
  next: number // next stop on the ladder
  trend: number // vs TREND_N games ago (clamped to first game)
  games: number
}

export function milestone(byClass: Record<string, RatingPoint[]>): Milestone | null {
  let best: string | null = null
  for (const k in byClass) if (!best || byClass[k].length > byClass[best].length) best = k
  if (!best) return null
  const pts = byClass[best]
  const cur = pts[pts.length - 1].rating
  return {
    timeClass: best,
    rating: cur,
    next: MILESTONES.find((m) => m > cur) ?? cur + 100,
    trend: cur - pts[Math.max(0, pts.length - 1 - TREND_N)].rating,
    games: pts.length,
  }
}
