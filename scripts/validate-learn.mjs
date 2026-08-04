#!/usr/bin/env node
// Validate public/data/learn.json against data/repertoire.pgn (031): every
// commented move in the PGN has a matching learn.json entry, every
// learn.json entry points at a real line/move, and all three systems have
// non-empty briefs. Exits non-zero on any failure.
//
// learn.json lives under public/data/ (032) — static and account-independent
// like traps.pgn/puzzles.json, unlike repertoire.pgn which is per-account and
// KV-served in production.
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const raw = readFileSync('data/repertoire.pgn', 'utf8')
const learn = JSON.parse(readFileSync('public/data/learn.json', 'utf8'))

let failures = 0
const fail = (msg) => {
  failures++
  console.log(`FAIL ${msg}`)
}

for (const system of ['Italian', 'Caro-Kann', 'Slav']) {
  const s = learn.systems?.[system]
  for (const field of ['plans', 'pawnBreaks', 'keySquares']) {
    if (!s?.[field]?.trim()) fail(`systems.${system}.${field} missing or empty`)
  }
}

const games = raw.trim().split(/\n\s*\n(?=\[Event )/)
const expectedKeys = {} // line name -> Set of keys the PGN's comments require
for (const chunk of games) {
  const h = {}
  chunk.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => ((h[k] = v), ''))
  const c = new Chess()
  c.loadPgn(chunk)
  const comments = {}
  for (const o of c.getComments()) comments[o.fen] = o.comment
  const name = (h.Event ?? '').replace(/^Repertoire:\s*/, '')
  const trainAs = h.TrainAs
  const keys = new Set()
  c.history({ verbose: true }).forEach((m, i) => {
    if (m.color === (trainAs === 'White' ? 'w' : 'b') && comments[m.after]) {
      const moveNo = Math.ceil((i + 1) / 2)
      keys.add(m.color === 'w' ? `${moveNo}.${m.san}` : `${moveNo}...${m.san}`)
    }
  })
  expectedKeys[name] = keys

  const entries = learn.lines?.[name]
  if (!entries) {
    fail(`data/learn.json missing line "${name}"`)
    continue
  }
  for (const key of keys) {
    if (!entries[key]?.trim()) fail(`"${name}" / ${key}: missing or empty learn.json entry`)
  }
}

for (const [name, entries] of Object.entries(learn.lines ?? {})) {
  if (!(name in expectedKeys)) {
    fail(`data/learn.json has line "${name}" that isn't in repertoire.pgn`)
    continue
  }
  for (const key of Object.keys(entries)) {
    if (!expectedKeys[name].has(key)) fail(`"${name}" / ${key}: not a commented move in repertoire.pgn`)
  }
}

console.log(`${games.length} repertoire lines checked`)
process.exit(failures ? 1 : 0)
