import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const DATA = path.resolve(import.meta.dirname, 'data')

// GET/PUT /api/data/<name> <-> data/<name>.json (ticket 004)
// <name> may carry an archives/ prefix for the sync loop's month files (015).
function dataApi(): Plugin {
  return {
    name: 'data-api',
    configureServer(server) {
      // data/ holds one account's own state and isn't tracked, so a fresh
      // clone has neither directory — the archives listing below readdir's
      // one of them, and every PUT writes into the other.
      fs.mkdirSync(path.join(DATA, 'archives'), { recursive: true })
      // PUT /api/repertoire — accepted line extensions (020) rewrite the PGN;
      // the client validated by re-parsing, git catches anything else.
      server.middlewares.use('/api/repertoire', (req, res) => {
        if (req.method !== 'PUT') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          if (!body.includes('[Event ')) {
            res.statusCode = 400
            return res.end('not pgn')
          }
          fs.writeFileSync(path.join(DATA, 'repertoire.pgn'), body)
          res.end('ok')
        })
      })
      server.middlewares.use('/api/data', (req, res) => {
        const name = (req.url ?? '').split('?')[0].slice(1)
        if (name === 'archives' && req.method === 'GET') {
          // month listing for the analysis mode (016)
          const months = fs
            .readdirSync(path.join(DATA, 'archives'))
            .flatMap((f) => (f.endsWith('.json') ? [f.slice(0, -5)] : []))
            .sort()
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(months))
        }
        if (!/^(archives\/)?[\w-]+$/.test(name)) {
          res.statusCode = 400
          return res.end('bad name')
        }
        const file = path.join(DATA, name + '.json')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'GET') {
          if (!fs.existsSync(file)) {
            res.statusCode = 404
            return res.end('{}')
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(fs.readFileSync(file))
        } else if (req.method === 'PUT') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            try {
              JSON.parse(body)
            } catch {
              res.statusCode = 400
              return res.end('not json')
            }
            fs.writeFileSync(file, body)
            res.end('ok')
          })
        } else {
          res.statusCode = 405
          res.end()
        }
      })

      // POST /api/coach <-> local Ollama (017/ADR 0001) — dev-only mirror of
      // the deployed Worker's /api/coach, which calls Workers AI instead.
      server.middlewares.use('/api/coach', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ ok: true }))
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          try {
            const { prompt } = JSON.parse(body)
            const r = await fetch('http://localhost:11434/api/generate', {
              method: 'POST',
              body: JSON.stringify({
                model: 'qwen2.5:7b-instruct',
                prompt,
                stream: false,
                keep_alive: '30m',
                options: { temperature: 0.6, num_predict: 160 },
              }),
            })
            const text = r.ok ? ((await r.json()).response ?? '') : ''
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ response: text }))
          } catch {
            res.statusCode = 502
            res.end()
          }
        })
      })
    },
  }
}

// Stockfish's own loader takes its *own* hashed script URL and swaps the
// .js suffix for .wasm to fetch its binary — a runtime string Vite can't see
// to know it should copy the companion file. Mirror the hash it lands on.
function stockfishWasm(): Plugin {
  const wasmSrc = path.resolve(
    import.meta.dirname,
    'node_modules/stockfish/bin/stockfish-18-lite-single.wasm',
  )
  return {
    name: 'stockfish-wasm',
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/^assets\/stockfish-18-lite-single-.*\.js$/.test(fileName)) {
          this.emitFile({
            type: 'asset',
            fileName: fileName.replace(/\.js$/, '.wasm'),
            source: fs.readFileSync(wasmSrc),
          })
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), dataApi(), stockfishWasm()],
  server: { port: 5173, strictPort: true },
})
