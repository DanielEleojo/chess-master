// Stockfish lite single-threaded (ticket 002) as a classic Web Worker — plain
// UCI strings in, info/bestmove lines out. One engine, serial eval queue.
import sfUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'
// spar.ts holds the weakening knobs and the pick, and imports nothing from
// here — so the selftest reaches them without dragging in the ?url above.
import { softmaxPick, type Weak } from './spar'

export interface Score {
  cp: number // side-to-move perspective; mate-in-N mapped to ±(10000 − N)
  best: string | null // uci, e.g. e2e4
  pv: string[] // principal variation in uci — the "why" behind best
  cp2: number | null // second-best move's score when asked at multipv 2 (035's Great)
}

export interface Engine {
  evalFen(fen: string, ms: number, multipv?: number): Promise<Score>
  // ponytail: Skill Level / MultiPV are sticky on the worker — sparring gets its own.
  playFen(fen: string, o: Weak): Promise<string | null>
  quit(): void
}

export function startEngine(): Engine {
  const w = new Worker(sfUrl)
  const until = (pred: (l: string) => boolean) =>
    new Promise<string[]>((resolve) => {
      const got: string[] = []
      const h = (e: MessageEvent) => {
        const line = String(e.data)
        got.push(line)
        if (pred(line)) {
          w.removeEventListener('message', h)
          resolve(got)
        }
      }
      w.addEventListener('message', h)
    })
  let queue: Promise<unknown> = (async () => {
    w.postMessage('uci')
    await until((l) => l === 'uciok')
    w.postMessage('isready')
    await until((l) => l === 'readyok')
  })()
  return {
    evalFen(fen, ms, multipv = 1) {
      const job = queue.then(async () => {
        const done = until((l) => l.startsWith('bestmove'))
        w.postMessage('setoption name MultiPV value ' + multipv) // sticky on the worker — pin it every call
        w.postMessage('position fen ' + fen)
        w.postMessage('go movetime ' + ms)
        const lines = await done
        // last info line per multipv slot; lines without the token are slot 1
        const slots = new Map<number, { cp: number; pv: string[] }>()
        for (const l of lines) {
          const m = l.match(/score (cp|mate) (-?\d+)/)
          if (!m) continue
          const cp = m[1] === 'cp' ? +m[2] : Math.sign(+m[2] || -1) * (10000 - Math.abs(+m[2]))
          const pm = l.match(/ pv (.+)/)
          slots.set(+(l.match(/multipv (\d+)/)?.[1] ?? 1), { cp, pv: pm ? pm[1].split(' ') : [] })
        }
        const top = slots.get(1) ?? { cp: 0, pv: [] }
        const bm = lines[lines.length - 1].split(' ')[1]
        return { cp: top.cp, best: bm && bm !== '(none)' ? bm : null, pv: top.pv, cp2: slots.get(2)?.cp ?? null }
      })
      queue = job.catch(() => {})
      return job
    },
    playFen(fen, o) {
      const job = queue.then(async () => {
        const done = until((l) => l.startsWith('bestmove'))
        w.postMessage('setoption name MultiPV value ' + o.multipv)
        w.postMessage('position fen ' + fen)
        w.postMessage('go nodes ' + o.nodes)
        const lines = await done
        // last info line per multipv slot = the deepest read of that candidate
        const cands = new Map<number, { mv: string; cp: number }>()
        for (const l of lines) {
          const m = l.match(/multipv (\d+).* score (cp|mate) (-?\d+).* pv ([a-h][1-8][a-h][1-8]\w?)/)
          if (m) cands.set(+m[1], { mv: m[4], cp: m[2] === 'cp' ? +m[3] : Math.sign(+m[3] || -1) * 4000 })
        }
        const list = [...cands.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c)
        if (list.length) return softmaxPick(list, o.temp)
        const bm = lines[lines.length - 1].split(' ')[1] // no info lines (mate/stalemate)
        return bm && bm !== '(none)' ? bm : null
      })
      queue = job.catch(() => {})
      return job
    },
    quit() {
      w.postMessage('quit')
      w.terminate()
    },
  }
}
