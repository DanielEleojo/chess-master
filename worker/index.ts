// Production replacement for vite.config.ts's dev-only dataApi middleware:
// same routes, same validation, KV instead of local disk so the site runs
// without the laptop. /data/puzzles.json and /data/traps.pgn are static now
// (public/data/), so only repertoire.pgn's read needs to hit the Worker too.
//
// Multi-account (ticket ???): Cloudflare Access sits in front of this Worker
// and gates every request behind a login (email one-time-code — configure in
// the CF dashboard, policy "Everyone" for open signup). Access injects a
// verified email header we trust as the account id and prefix every KV key
// with, so each login only ever sees its own data. No header (local dev,
// Access not yet configured) falls back to one shared dev account.

import { sendPush, type PushSubscription } from './push'

const NAME_RE = /^(archives\/)?[\w-]+$/

// Coach voice (ticket 017 / ADR 0001) moved here from a direct browser->local
// -Ollama call: that only worked when the browser and Ollama shared a machine,
// which broke once the site left Daniel's laptop. Workers AI is reachable
// from anywhere the deployed site is. GET is a cheap liveness ping for the
// selftest — it doesn't spend an inference call.
const COACH_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8'

async function coachRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return Response.json({ ok: true })
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const { prompt } = await request.json<{ prompt?: string }>()
  if (typeof prompt !== 'string' || !prompt) return new Response('bad request', { status: 400 })
  try {
    const out = (await env.AI.run(COACH_MODEL, {
      prompt,
      max_tokens: 200,
      temperature: 0.6,
    })) as { response?: string }
    return Response.json({ response: out.response ?? '' })
  } catch {
    return new Response(null, { status: 502 })
  }
}

function accountId(request: Request): string {
  return request.headers.get('Cf-Access-Authenticated-User-Email')?.toLowerCase() ?? 'dev@local'
}

async function dataRoute(uid: string, name: string, request: Request, env: Env): Promise<Response> {
  const prefix = `${uid}/`
  if (name === 'archives' && request.method === 'GET') {
    const list = await env.DATA.list({ prefix: `${prefix}archives/` })
    const months = list.keys.map((k) => k.name.slice(`${prefix}archives/`.length)).sort()
    return Response.json(months)
  }
  if (!NAME_RE.test(name)) return new Response('bad name', { status: 400 })
  const key = prefix + name

  if (request.method === 'GET') {
    const value = await env.DATA.get(key)
    return new Response(value ?? '{}', {
      status: value === null ? 404 : 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
  if (request.method === 'PUT') {
    const body = await request.text()
    try {
      JSON.parse(body)
    } catch {
      return new Response('not json', { status: 400 })
    }
    await env.DATA.put(key, body)
    return new Response('ok')
  }
  return new Response(null, { status: 405 })
}

// Ticket 026: same signal as recommend.ts's INACTIVITY_DAYS rung, duplicated
// rather than imported — worker/ and src/ are separate bundles (COACH_MODEL
// above mirrors src/lib/coach.ts's MODEL the same way).
const PUSH_INACTIVITY_DAYS = 5

async function pushAccount(uid: string, env: Env): Promise<void> {
  const sub = await env.DATA.get<PushSubscription>(`${uid}/push-subscription`, 'json')
  if (!sub) return
  const history = await env.DATA.get<{ sessions?: { at: string }[] }>(`${uid}/drill-history`, 'json')
  const last = history?.sessions?.at(-1)
  if (!last) return
  const days = Math.floor((Date.now() - new Date(last.at).getTime()) / 86400000)
  if (days < PUSH_INACTIVITY_DAYS) return

  const state = await env.DATA.get<{ lastPushAt?: string }>(`${uid}/push-state`, 'json')
  if (state?.lastPushAt && state.lastPushAt > last.at) return // already pushed for this quiet streak

  const res = await sendPush(
    sub,
    `${days} days since your last session — your coach has a pick ready.`,
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) },
  )
  if (res.ok) {
    await env.DATA.put(`${uid}/push-state`, JSON.stringify({ lastPushAt: new Date().toISOString() }))
  } else if (res.status === 404 || res.status === 410) {
    await env.DATA.delete(`${uid}/push-subscription`) // gone or unsubscribed at the browser end
  }
}

// Every route above already scopes data by a uid prefix (Cloudflare Access
// email); the cron just has to discover which prefixes exist. One list() call
// over the whole namespace is fine at this account count — revisit with a
// maintained account-index key if that ever stops being true.
async function listAccounts(env: Env): Promise<string[]> {
  const uids = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await env.DATA.list({ cursor })
    for (const k of page.keys) {
      const slash = k.name.indexOf('/')
      if (slash > 0) uids.add(k.name.slice(0, slash))
    }
    if (page.list_complete) break
    cursor = page.cursor
  }
  return [...uids]
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    const uid = accountId(request)

    if (pathname === '/data/repertoire.pgn') {
      if (request.method !== 'GET') return new Response(null, { status: 405 })
      const pgn = await env.DATA.get(`${uid}/repertoire.pgn`)
      return new Response(pgn ?? '', { headers: { 'content-type': 'application/x-chess-pgn' } })
    }

    if (pathname === '/api/repertoire') {
      if (request.method !== 'PUT') return new Response(null, { status: 405 })
      const body = await request.text()
      if (!body.includes('[Event ')) return new Response('not pgn', { status: 400 })
      await env.DATA.put(`${uid}/repertoire.pgn`, body)
      return new Response('ok')
    }

    if (pathname.startsWith('/api/data/')) {
      return dataRoute(uid, pathname.slice('/api/data/'.length), request, env)
    }

    if (pathname === '/api/coach') {
      return coachRoute(request, env)
    }

    return env.ASSETS.fetch(request)
  },

  // Daily Cron Trigger (ticket 026): fires once per account the first day it
  // crosses PUSH_INACTIVITY_DAYS quiet, never repeats until a new session resets it.
  async scheduled(_event, env) {
    for (const uid of await listAccounts(env)) {
      await pushAccount(uid, env).catch(() => {})
    }
  },
} satisfies ExportedHandler<Env>
