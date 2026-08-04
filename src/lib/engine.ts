// Stockfish lite single-threaded (ticket 002) as a classic Web Worker — plain
// UCI strings in, info/bestmove lines out. One engine, serial eval queue.
import sfUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'

export interface Score {
  cp: number // side-to-move perspective; mate-in-N mapped to ±(10000 − N)
  best: string | null // uci, e.g. e2e4
  pv: string[] // principal variation in uci — the "why" behind best
}

// Sparring strength (014). Node caps alone were not enough — even `nodes 1`
// defends scholar's mate, so the real dial is *randomness*: search wide, then
// pick from the candidates with a softmax. `temp` is in centipawns — the loss a
// move can carry and still get played ~37% as often as the best one.
// No Skill Level here: it only rewrites Stockfish's *bestmove*, which this
// discards in favour of its own pick — measured inert, so it's gone.
export interface Weak {
  nodes: number
  multipv: number
  temp: number // 0 = always the top move
}

// exported for the selftest — pure, no engine needed
export function softmaxPick(cands: { mv: string; cp: number }[], temp: number): string {
  if (temp <= 0) return cands[0].mv
  const top = Math.max(...cands.map((c) => c.cp))
  const ws = cands.map((c) => Math.exp(Math.max(c.cp - top, -4000) / temp))
  let r = Math.random() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ws.length; i++) if ((r -= ws[i]) <= 0) return cands[i].mv
  return cands[0].mv
}

export interface Engine {
  evalFen(fen: string, ms: number): Promise<Score>
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
    evalFen(fen, ms) {
      const job = queue.then(async () => {
        const done = until((l) => l.startsWith('bestmove'))
        w.postMessage('position fen ' + fen)
        w.postMessage('go movetime ' + ms)
        const lines = await done
        let cp = 0
        let pv: string[] = []
        for (const l of lines) {
          const m = l.match(/score (cp|mate) (-?\d+)/)
          if (m) {
            cp = m[1] === 'cp' ? +m[2] : Math.sign(+m[2] || -1) * (10000 - Math.abs(+m[2]))
            const pm = l.match(/ pv (.+)/)
            if (pm) pv = pm[1].split(' ')
          }
        }
        const bm = lines[lines.length - 1].split(' ')[1]
        return { cp, best: bm && bm !== '(none)' ? bm : null, pv }
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
