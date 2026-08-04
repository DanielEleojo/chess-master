import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { parseGames, type Line } from '../lib/pgn'
import { applyExtension, tailGrace } from '../lib/extend'
import { makeDrill, userMoveIdxs } from '../lib/drill'
import { buildDeck } from './TrapCards'
import { bump, type Stat } from '../lib/history'
import { USER, describeGame, gameParts, monthKey, newGames, type Game } from '../lib/sync'
import { SPAR_TC, bookWalk, flagMoves, sparGame } from '../lib/analyze'
import { softmaxPick, startEngine } from '../lib/engine'
import { RUNGS } from './Spar'
import { computeFacts } from '../lib/facts'
import { MODEL, coachUp } from '../lib/coach'
import type { Analysis } from '../lib/analyze'
import { emptyHistory } from '../lib/history'
import { CLUSTER_MIN, milestone, pickNext, ratingHistory } from '../lib/recommend'
import { OWN_QUOTA, blunderCard, dealCards, type PCard } from '../lib/puzzles'

// Ported from the prototype's ?selftest=1 — same logic checks, now against the
// fetched real seed files, plus a middleware round-trip. The app's one check.
export function Selftest({
  lines,
  traps,
  tactics,
}: {
  lines: Line[]
  traps: Line[]
  tactics: PCard[]
}) {
  const [out, setOut] = useState<string[]>([])

  useEffect(() => {
    const res: string[] = []
    const ok = (name: string, cond: boolean) => res.push((cond ? 'PASS' : 'FAIL') + '  ' + name)

    // ≥: accepted line extensions (020) legitimately grow the repertoire
    ok(`repertoire parsed: ${lines.length} lines (expect >= 22)`, lines.length >= 22)
    ok(`traps parsed: ${traps.length} traps (expect 15)`, traps.length === 15)
    for (const l of [...lines, ...traps])
      ok(
        `${l.name}: ${l.moves.length} plies, has ${l.trainAs} moves`,
        l.moves.length >= 2 && userMoveIdxs(l).length >= 1,
      )
    const commented = lines.filter((l) => Object.keys(l.comments).length > 0).length
    ok(`repertoire why-comments survive parsing (${commented} lines have them)`, commented === lines.length)
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
    ok('book: outlived line carries the opponent continuation (020)', whole?.outlived === true && whole.oppSan === 'Bc5')
    const covered = bookWalk(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'w', book)
    ok('book: game ending inside the line is not outlived', covered?.outlived === false && covered.oppSan === null)
    const meLeft = bookWalk(['e4', 'c5', 'Nc3'], 'w', book)
    ok(
      'book: my deviation flagged with expected move',
      meLeft?.leftAtPly === 2 && meLeft.by === 'me' && meLeft.expectedSan === 'Nf3',
    )
    const oppLeft = bookWalk(['e4', 'd5'], 'w', book)
    ok('book: opponent deviation flagged with their move (020)', oppLeft?.leftAtPly === 1 && oppLeft.by === 'opp' && oppLeft.oppSan === 'd5')
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
      mkA({ book: { line, matchedPlies: 4, leftAtPly: 4, by: 'me', expectedSan: 'Bc4', oppSan: null, outlived: false } })
    const oppBook = (line: string, oppSan = 'd5', ply = 4): Analysis =>
      mkA({ book: { line, matchedPlies: ply, leftAtPly: ply, by: 'opp', expectedSan: null, oppSan, outlived: false } })
    const outBook = (line: string): Analysis =>
      mkA({ book: { line, matchedPlies: 6, leftAtPly: null, by: null, expectedSan: null, oppSan: 'c4', outlived: true } })
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

    // line extension (tickets 019/020) — trigger, rung, dismissal, grace, PGN append
    const pBr = pickNext(0, [oppBook('X'), oppBook('X')], emptyHistory())
    ok('extend: opp-left same break twice proposes a branch', pBr.kind === 'extend' && pBr.ext?.kind === 'branch' && pBr.ext.oppSan === 'd5')
    ok('extend: one surprise is not a trigger', pickNext(0, [oppBook('X')], emptyHistory()).kind !== 'extend')
    ok('extend: different moves at the break do not pool', pickNext(0, [oppBook('X', 'd5'), oppBook('X', 'c5')], emptyHistory()).kind !== 'extend')
    const pTail = pickNext(0, [outBook('Y'), outBook('Y')], emptyHistory())
    ok('extend: outlived line twice proposes a tail', pTail.kind === 'extend' && pTail.ext?.kind === 'tail' && pTail.ext.ply === 6)
    ok('extend: daniel-left rung outranks extension', pickNext(0, [leftBook('X'), leftBook('X'), outBook('Y'), outBook('Y')], emptyHistory()).kind === 'left-line')
    const dis = { dismissed: [{ line: 'Y', ply: 6, oppSan: 'c4', games: 2 }], preLen: {} }
    ok('extend: dismissed break sleeps', pickNext(0, [outBook('Y'), outBook('Y')], emptyHistory(), dis).kind !== 'extend')
    ok('extend: a new game re-hitting the break re-proposes', pickNext(0, [outBook('Y'), outBook('Y'), outBook('Y')], emptyHistory(), dis).kind === 'extend')

    const ge = { dismissed: [], preLen: { Z: 4 } }
    ok('extend: miss on old plies is not graced', !tailGrace(ge, 'Z', 2) && ge.preLen.Z === 4)
    ok('extend: first miss beyond pre-extension length graced once', tailGrace(ge, 'Z', 5) && !tailGrace(ge, 'Z', 5))
    ok('extend: unextended line never graced', !tailGrace(ge, 'Q', 9))

    const rawRep =
      '[Event "Repertoire: T1"]\n[System "T"]\n[TrainAs "White"]\n[Result "*"]\n\n1. e4 {why e4} e5 2. Nf3 {why Nf3} *'
    const tLine = parseGames(rawRep)[0]
    const tOut = applyExtension(rawRep, tLine, { line: 'T1', ply: 3, oppSan: 'Nc6', kind: 'tail', games: 2 }, ['Nc6', 'Bc4'])
    const tp = parseGames(tOut)
    ok('extend: tail rewrites the line in place', tp.length === 1 && tp[0].name === 'T1' && tp[0].moves.length === 5 && tp[0].moves[4].san === 'Bc4')
    ok('extend: old why-comments survive the rewrite', tp[0]?.comments[tp[0].moves[0].after] === 'why e4')
    ok('extend: new user plies carry a why', !!tp[0]?.comments[tp[0].moves[4].after])
    const bOut = applyExtension(rawRep, tLine, { line: 'T1', ply: 1, oppSan: 'c5', kind: 'branch', games: 2 }, ['c5', 'Nf3', 'd6', 'd4'])
    const bp = parseGames(bOut)
    ok(
      'extend: branch appends a new line sharing the prefix',
      bp.length === 2 && bp[1].name === 'T1 (c5 branch)' && bp[1].moves.map((m) => m.san).join(' ') === 'e4 c5 Nf3 d6 d4',
    )
    ok('extend: branch user plies carry a why', bp.length === 2 && userMoveIdxs(bp[1]).every((j) => !!bp[1].comments[bp[1].moves[j].after]))
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

    // tactics deck (ticket 013) — fen-rooted cards walked by the shared drill engine
    ok(`tactics deck loaded: ${tactics.length} cards (expect >= 300)`, tactics.length >= 300)
    const brokeCards: string[] = []
    for (const c of tactics) {
      const cd = makeDrill(c.line, c.start)
      let steps = 0
      while (!cd.done() && steps++ < 12) {
        const e = cd.expected()
        if (e.color === cd.uc) {
          if (!cd.tryMove(e.from, e.to).ok) break
        } else cd.autoMoves()
      }
      if (!cd.done()) brokeCards.push(c.key)
    }
    ok(`every tactics card walks its own solution (${brokeCards.slice(0, 3).join(', ') || 'none broken'})`, brokeCards.length === 0)
    ok(
      'tactics cards start on his turn, after the move that walked into it',
      tactics.every((c) => c.line.moves[c.start].color === (c.line.trainAs === 'White' ? 'w' : 'b')),
    )
    ok(
      'tactics cards are 1-2 moves for him (no veryLong grinds)',
      tactics.every((c) => Math.ceil((c.line.moves.length - c.start) / 2) <= 2),
    )
    const bCard = blunderCard(mkA({ uuid: 'g1', desc: 'You lost vs X · rapid' }), {
      ply: 10, san: 'Qd5', fen: 'r1bqkbnr/pppp1pp1/2n4p/8/2B1P3/2p2N2/PP3PPP/RNBQK2R w KQkq - 0 6',
      best: 'e1g1', bestSan: 'O-O', pvSan: ['O-O', 'Nf6'], punishSan: [], swingCp: 104, severity: 'mistake',
    })!
    ok(
      'his own flagged move becomes a card starting on his turn',
      !!bCard && bCard.start === 0 && bCard.own && bCard.line.moves[0].san === 'O-O',
    )
    ok('own card names the move he missed and why (017 fact layer)', bCard?.why.startsWith('O-O') && bCard.why.length > 12)
    const pool = tactics.slice(0, 50)
    const mineCards = Array.from({ length: 9 }, (_, i) => ({ ...bCard, key: 'o:' + i }))
    const dealt10 = dealCards(pool, mineCards, emptyHistory())
    ok(
      `deal reserves ${OWN_QUOTA} of 10 cards for his own mistakes`,
      dealt10.length === 10 && dealt10.filter((c) => c.own).length === OWN_QUOTA,
    )
    ok('coach deep-link deals his own positions only', dealCards(pool, mineCards, emptyHistory(), true).every((c) => c.own))
    ok('no flagged games yet: deal still fills from lichess', dealCards(pool, [], emptyHistory(), true).length === 10)
    ok('coach: non-opening cluster deals those positions back as cards (013)', pClu.mode === 'puzzles' && pClu.ownOnly === true)

    // sparring (014): the softmax is what makes the low rungs beatable — temp 0
    // must never stray, and the floor's temp must actually reach the bad moves
    const cands = [
      { mv: 'e2e4', cp: 30 },
      { mv: 'g1f3', cp: -20 },
      { mv: 'b1a3', cp: -300 },
      { mv: 'g2g4', cp: -900 },
    ]
    ok(
      'spar: temp 0 always plays the top candidate',
      Array.from({ length: 30 }, () => softmaxPick(cands, 0)).every((m) => m === 'e2e4'),
    )
    const roll = (temp: number) =>
      Array.from({ length: 400 }, () => softmaxPick(cands, temp)).filter((m) => m === 'g2g4').length
    const floor = roll(RUNGS[0].temp)
    ok(`spar: the floor (temp ${RUNGS[0].temp}) hangs the -900cp move sometimes (${floor}/400)`, floor > 20 && floor < 200)
    const improver = roll(RUNGS[3].temp)
    ok(`spar: rungs are ordered — Improver hangs it far less (${improver}/400)`, improver < floor / 2)

    // a finished spar game is recorded as one of his games, so the existing walk
    // flags it and the coach reads it with no rung of its own
    const spLoss = new Chess()
    for (const s of ['f3', 'e5', 'g4', 'Qh4#']) spLoss.move(s)
    const sg = sparGame(spLoss, 'w', 'Rookie', false, 1000)
    ok(
      'spar: game recorded as his own, unrated (milestone ladder stays real)',
      sg.uuid === 'spar-1000' && sg.white.username === USER && sg.time_class === SPAR_TC && sg.rated === false,
    )
    ok(
      'spar: being mated reads as a loss',
      describeGame(sg) === 'You lost vs Rookie · sparring' && gameParts(sg).mark === '0',
    )
    const spBack = new Chess()
    spBack.loadPgn(sg.pgn)
    ok('spar: the game survives as pgn for the engine walk', spBack.history().join(' ') === 'f3 e5 g4 Qh4#')
    const spWin = new Chess()
    for (const s of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) spWin.move(s)
    ok('spar: his own mate reads as a win', gameParts(sparGame(spWin, 'w', 'Rookie', false, 1)).mark === '1')
    ok('spar: resigning is a loss whatever the board says', gameParts(sparGame(spWin, 'w', 'Careless', true, 2)).mark === '0')
    ok(
      'spar: stalemate is a half point',
      gameParts(sparGame(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 'b', 'Rookie', false, 3)).mark === '½',
    )

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
  }, [lines, traps, tactics])

  const fails = out.filter((s) => s.startsWith('FAIL')).length
  return (
    <div className="card selftest">
      <h2>Selftest {out.length ? (fails ? `❌ ${fails} failing` : '✅ all green') : '…'}</h2>
      <pre>{out.join('\n')}</pre>
    </div>
  )
}
