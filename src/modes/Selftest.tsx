import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import type { Line } from '../lib/pgn'
import { makeDrill, userMoveIdxs } from '../lib/drill'
import { buildDeck } from './TrapCards'
import { bump, type Stat } from '../lib/history'
import { describeGame, monthKey, newGames, type Game } from '../lib/sync'
import { bookWalk, flagMoves } from '../lib/analyze'
import { startEngine } from '../lib/engine'
import { computeFacts } from '../lib/facts'
import { MODEL, coachUp } from '../lib/coach'
import type { Analysis } from '../lib/analyze'
import { emptyHistory } from '../lib/history'
import { CLUSTER_MIN, milestone, pickNext, ratingHistory } from '../lib/recommend'

// Ported from the prototype's ?selftest=1 — same logic checks, now against the
// fetched real seed files, plus a middleware round-trip. The app's one check.
export function Selftest({ lines, traps }: { lines: Line[]; traps: Line[] }) {
  const [out, setOut] = useState<string[]>([])

  useEffect(() => {
    const res: string[] = []
    const ok = (name: string, cond: boolean) => res.push((cond ? 'PASS' : 'FAIL') + '  ' + name)

    ok(`repertoire parsed: ${lines.length} lines (expect 22)`, lines.length === 22)
    ok(`traps parsed: ${traps.length} traps (expect 15)`, traps.length === 15)
    for (const l of [...lines, ...traps])
      ok(
        `${l.name}: ${l.moves.length} plies, has ${l.trainAs} moves`,
        l.moves.length >= 2 && userMoveIdxs(l).length >= 1,
      )
    const commented = lines.filter((l) => Object.keys(l.comments).length > 0).length
    ok(`repertoire why-comments survive parsing (${commented} lines have them)`, commented === 22)
    // every miss must teach: each drillable user move carries a why-comment
    const bare = lines.flatMap((l) =>
      userMoveIdxs(l).filter((j) => !l.comments[l.moves[j].after]).map((j) => `${l.name}#${j}`),
    )
    ok(`every repertoire user move has a why (${bare.length} bare: ${bare.slice(0, 3).join(', ') || 'none'})`, bare.length === 0)

    const d = makeDrill(lines[0])
    d.autoMoves()
    ok('drill starts on user turn', !d.done() && d.expected().color === d.uc)
    const w = d.tryMove('a2', 'a3')
    ok('wrong move rejected and position restored', !w.ok && d.chess.fen() === new Chess().fen())
    let steps = 0
    while (!d.done() && steps++ < 40) {
      const e = d.expected()
      if (e.color === d.uc) {
        if (!d.tryMove(e.from, e.to).ok) break
      } else d.autoMoves()
    }
    ok('full line completes on correct moves', d.done())

    const deck = buildDeck(traps)
    ok(`trap deck: ${deck.length} cards (expect >= 15)`, deck.length >= 15)
    const withWhy = deck.filter((c) => c.line.comments[c.line.moves[c.k].after]).length
    ok(`every trap card carries a why-comment (${withWhy}/${deck.length})`, withWhy === deck.length)
    let cardsOk = true
    for (const c of deck) {
      const cd = makeDrill(c.line, c.k)
      const e = cd.expected()
      if (e.color !== cd.uc || !cd.tryMove(e.from, e.to).ok) cardsOk = false
    }
    ok('every trap card starts on the punisher and accepts its move', cardsOk)

    // grace first attempt (ticket 012): first-ever miss forgiven, hits and later misses count
    const g: Record<string, Stat> = {}
    bump(g, 'x', true)
    ok('first-ever miss not recorded', g.x.seen === 1 && g.x.missed === 0)
    bump(g, 'x', true)
    ok('second miss recorded', g.x.seen === 2 && g.x.missed === 1)
    bump(g, 'y', false)
    ok('first-attempt hit credited', g.y.seen === 1 && g.y.missed === 0)

    // live sync helpers (ticket 015)
    const mk = (uuid: string, myResult: string, oppResult: string): Game => ({
      uuid,
      time_class: 'rapid',
      white: { username: 'Opp', result: oppResult },
      black: { username: 'BabaDaniel', result: myResult },
    })
    const won = mk('a', 'win', 'checkmated')
    const lost = mk('b', 'timeout', 'win')
    const drew = mk('c', 'stalemate', 'stalemate')
    ok('sync diff finds only unseen uuids', newGames([won], [won, lost]).map((g) => g.uuid).join() === 'b')
    ok('sync toast: win', describeGame(won) === 'You won vs Opp · rapid')
    ok('sync toast: loss', describeGame(lost) === 'You lost vs Opp · rapid')
    ok('sync toast: draw', describeGame(drew) === 'You drew vs Opp · rapid')
    ok('month key is UTC YYYY-MM', /^\d{4}-\d{2}$/.test(monthKey(new Date())))

    // analysis: book walk (ticket 016 — the left-book signal 003 feeds on)
    const mkLine = (sans: string[], trainAs: 'White' | 'Black'): Line => {
      const c = new Chess()
      for (const s of sans) c.move(s)
      return { idx: 0, name: sans.join(' '), system: 'T', trainAs, moves: c.history({ verbose: true }), comments: {} }
    }
    const book = [mkLine(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'White'), mkLine(['e4', 'c5', 'Nf3'], 'White')]
    const whole = bookWalk(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], 'w', book)
    ok('book: full-line match ends in book', whole?.leftAtPly === null && whole.matchedPlies === 5)
    const meLeft = bookWalk(['e4', 'c5', 'Nc3'], 'w', book)
    ok(
      'book: my deviation flagged with expected move',
      meLeft?.leftAtPly === 2 && meLeft.by === 'me' && meLeft.expectedSan === 'Nf3',
    )
    const oppLeft = bookWalk(['e4', 'd5'], 'w', book)
    ok('book: opponent deviation flagged', oppLeft?.leftAtPly === 1 && oppLeft.by === 'opp')
    ok('book: never-in-book is null', bookWalk(['d4', 'd5'], 'w', book) === null)

    // analysis: blunder flagging on hand-made evals
    const bg = new Chess()
    for (const s of ['e4', 'e5', 'Qh5']) bg.move(s)
    const bm = bg.history({ verbose: true })
    const flags = flagMoves(bm, [20, 30, 20, -250], [[], [], ['g1f3', 'b8c6'], []], 'w')
    ok(
      'blunder: white swing ≥250cp flagged with best move',
      flags.length === 1 && flags[0].ply === 2 && flags[0].severity === 'blunder' && flags[0].bestSan === 'Nf3',
    )
    ok('blunder: fen is the position before the move (013 card shape)', flags[0]?.fen === bm[2].before)
    ok('blunder: pv converts to san (the why line)', flags[0]?.pvSan.join(' ') === 'Nf3 Nc6')
    const bFlags = flagMoves(bm, [0, 0, 150, 150], [[], ['d7d5'], [], []], 'b')
    ok('blunder: black swing sign handled, 150cp = mistake', bFlags.length === 1 && bFlags[0].ply === 1 && bFlags[0].severity === 'mistake')
    ok('blunder: quiet moves stay unflagged', flagMoves(bm, [20, 25, 20, 30], [[], [], [], []], 'w').length === 0)
    const pFlags = flagMoves(bm, [20, 30, 20, -250], [[], [], ['g1f3'], ['d8h4']], 'w')
    ok('blunder: punish line stored in san (017 facts input)', pFlags[0]?.punishSan.join(' ') === 'Qh4')

    // fact layer (ticket 017, ADR 0001) — the deterministic truths under the coach voice
    const fool = new Chess()
    fool.move('f3'), fool.move('e5')
    const fMate = computeFacts({ fen: fool.fen(), played: 'g4', best: 'd4', bestLine: ['d4'], punishLine: ['Qh4#'], swingCp: 9900 })
    ok('facts: mate in the punish line reported', fMate.some((s) => s.includes('checkmate')))
    const hq = new Chess()
    for (const s of ['e4', 'e5', 'Qh5', 'Nc6']) hq.move(s)
    const fHang = computeFacts({ fen: hq.fen(), played: 'Qxe5+', best: 'Nc3', bestLine: ['Nc3'], punishLine: ['Nxe5'], swingCp: 780 })
    ok('facts: hung queen reported', fHang.some((s) => s.includes('queen') && s.includes('takes it')))
    const fFork = computeFacts({ fen: '6k1/8/8/2b5/8/8/PR3R2/6K1 w - - 0 1', played: 'a3', best: 'Rb5', bestLine: ['Rb5'], punishLine: ['Bd4', 'a4', 'Bxb2'], swingCp: 300 })
    ok('facts: fork spotted', fFork.some((s) => s.includes('forks both your rooks')))
    ok('facts: material along the punish line', fFork.some((s) => s.includes('wins your rook')))
    const cstl = new Chess()
    cstl.move('e4'), cstl.move('e5')
    const fK = computeFacts({ fen: cstl.fen(), played: 'Ke2', best: 'Nf3', bestLine: ['Nf3'], punishLine: ['Nc6'], swingCp: 40 })
    ok('facts: bare king move loses castling', fK.some((s) => s.includes('castling')))
    const fBest = computeFacts({ fen: (() => { const c = new Chess(); c.move('e4'), c.move('d5'); return c.fen() })(), played: 'a3', best: 'exd5', bestLine: ['exd5'], punishLine: ['dxe4'], swingCp: 120 })
    ok('facts: best-line material win reported', fBest.some((s) => s.includes('exd5 wins a pawn')))
    const fQuiet = computeFacts({ fen: new Chess().fen(), played: 'a3', best: 'e4', bestLine: ['e4'], punishLine: ['e5'], swingCp: 60 })
    ok('facts: quiet miss falls back to positional', fQuiet.length === 1 && fQuiet[0].includes('positional'))

    // coach recommender (ticket 018) — deterministic ladder + milestone ladder
    const mkA = (over: Partial<Analysis>): Analysis => ({
      uuid: 'u', at: '', v: 3, ms: 300, color: 'w', desc: '', endTime: 0, evals: [], blunders: [], book: null, ...over,
    })
    const leftBook = (line: string): Analysis =>
      mkA({ book: { line, matchedPlies: 4, leftAtPly: 4, by: 'me', expectedSan: 'Bc4' } })
    const blunderAt = (ply: number): Analysis =>
      mkA({ blunders: [{ ply, san: '', fen: '', best: '', bestSan: '', pvSan: [], punishSan: [], swingCp: 300, severity: 'blunder' }] })
    ok('coach: unseen games top the ladder', pickNext(3, [leftBook('X'), leftBook('X')], emptyHistory()).kind === 'new-games')
    const pLeft = pickNext(0, [leftBook('X'), leftBook('X'), blunderAt(20), blunderAt(25), blunderAt(30)], emptyHistory())
    ok('coach: repeated left line beats blunder cluster, deep-links the line', pLeft.kind === 'left-line' && pLeft.focusLine === 'X' && pLeft.mode === 'lines')
    ok('coach: one departure is not a weakness', pickNext(0, [leftBook('X')], emptyHistory()).kind !== 'left-line')
    const pClu = pickNext(0, [blunderAt(20), blunderAt(25), blunderAt(30)], emptyHistory())
    ok(`coach: ${CLUSTER_MIN} same-phase blunders called as a cluster`, pClu.kind === 'blunder-cluster' && pClu.evidence[0].includes('middlegame'))
    const wh = emptyHistory()
    wh.lines['Italian main line'] = { seen: 6, missed: 4 }
    const pWeak = pickNext(0, [], wh)
    ok('coach: weak drill stat picked with evidence', pWeak.kind === 'weak-drill' && pWeak.focusLine === 'Italian main line' && pWeak.evidence[0].includes('4 of 6'))
    ok('coach: clean data falls back to default reps', pickNext(0, [], emptyHistory()).kind === 'default')
    const gr = (t: number, rating: number, tc = 'rapid'): Game => ({
      uuid: String(t), time_class: tc, rated: true, end_time: t,
      white: { username: 'BabaDaniel', result: 'win', rating },
      black: { username: 'o', result: 'resigned' },
    })
    const rh = ratingHistory([gr(3, 344), gr(1, 300), gr(2, 320), gr(1, 100, 'bullet'), { ...gr(4, 999), rated: false }])
    ok('coach: rating history per class, sorted, rated only', rh.rapid?.length === 3 && rh.rapid[2].rating === 344 && rh.bullet?.length === 1)
    const m = milestone(rh)!
    ok('coach: milestone headlines most-played class, next stop above current', m.timeClass === 'rapid' && m.rating === 344 && m.next === 400)
    ok('coach: trend measured against earlier games', m.trend === 44)
    ok('coach: no games, no milestone', milestone({}) === null)

    setOut(res)
    ;(async () => {
      const payload = { probe: Math.floor(performance.now()) }
      let roundtrip = false
      try {
        const put = await fetch('/api/data/selftest', { method: 'PUT', body: JSON.stringify(payload) })
        const back = await (await fetch('/api/data/selftest')).json()
        roundtrip = put.ok && back.probe === payload.probe
      } catch {
        /* stays false */
      }
      setOut((o) => [...o, (roundtrip ? 'PASS' : 'FAIL') + '  data middleware PUT/GET round-trip'])
      let archives = false
      try {
        const a = await (await fetch('/api/data/archives/' + monthKey(new Date()))).json()
        archives = Array.isArray(a.games)
      } catch {
        /* stays false */
      }
      setOut((o) => [...o, (archives ? 'PASS' : 'FAIL') + '  archives/ route serves the current month'])
      let months = false
      try {
        const l = await (await fetch('/api/data/archives')).json()
        months = Array.isArray(l) && l.includes(monthKey(new Date()))
      } catch {
        /* stays false */
      }
      setOut((o) => [...o, (months ? 'PASS' : 'FAIL') + '  archives month listing includes current month'])
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
      setOut((o) => [...o, (engineOk ? 'PASS' : 'FAIL') + '  stockfish worker evals startpos'])
      // coach voice (017): reachability is informational — facts-only fallback is by design
      const up = await coachUp()
      setOut((o) => [...o, `PASS  coach voice: ollama ${up ? `reachable (${MODEL})` : 'down — facts-only fallback active'}`])
    })()
  }, [lines, traps])

  const fails = out.filter((s) => s.startsWith('FAIL')).length
  return (
    <div className="card selftest">
      <h2>Selftest {out.length ? (fails ? `❌ ${fails} failing` : '✅ all green') : '…'}</h2>
      <pre>{out.join('\n')}</pre>
    </div>
  )
}
