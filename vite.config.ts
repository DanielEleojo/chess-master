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
      server.middlewares.use('/api/data', (req, res) => {
        const name = (req.url ?? '').split('?')[0].slice(1)
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
    },
  }
}

export default defineConfig({
  plugins: [react(), dataApi()],
  server: { port: 5173, strictPort: true },
})
