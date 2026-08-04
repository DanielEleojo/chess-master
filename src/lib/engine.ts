// Stockfish lite single-threaded (ticket 002) as a classic Web Worker — plain
// UCI strings in, info/bestmove lines out. One engine, serial eval queue.
import sfUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'

export interface Score {
  cp: number // side-to-move perspective; mate-in-N mapped to ±(10000 − N)
  best: string | null // uci, e.g. e2e4
  pv: string[] // principal variation in uci — the "why" behind best
}

export interface Engine {
  evalFen(fen: string, ms: number): Promise<Score>
  // Sparring (014): deliberately weak play. Skill Level already randomises among
  // Stockfish's own candidate moves, so the node cap is the real strength dial.
  // ponytail: the option is sticky on the worker — sparring gets its own engine.
  playFen(fen: string, skill: number, nodes: number): Promise<string | null>
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
    playFen(fen, skill, nodes) {
      const job = queue.then(async () => {
        const done = until((l) => l.startsWith('bestmove'))
        w.postMessage('setoption name Skill Level value ' + skill)
        w.postMessage('position fen ' + fen)
        w.postMessage('go nodes ' + nodes)
        const bm = (await done).pop()!.split(' ')[1]
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
