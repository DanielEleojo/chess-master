import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'
import type { Chess } from 'chess.js'

export function destsOf(c: Chess): Map<Key, Key[]> {
  const m = new Map<Key, Key[]>()
  for (const mv of c.moves({ verbose: true })) {
    const from = mv.from as Key
    if (!m.has(from)) m.set(from, [])
    m.get(from)!.push(mv.to as Key)
  }
  return m
}

export function syncBoard(
  cg: Api,
  chess: Chess,
  uc: 'w' | 'b',
  myTurn: boolean,
  lm: [string, string] | null,
): void {
  cg.set({
    fen: chess.fen(),
    turnColor: chess.turn() === 'w' ? 'white' : 'black',
    check: chess.inCheck(),
    lastMove: lm ? (lm as Key[]) : undefined,
    movable: {
      free: false,
      color: myTurn ? (uc === 'w' ? 'white' : 'black') : undefined,
      dests: myTurn ? destsOf(chess) : new Map(),
      showDests: true,
    },
  })
}

export function Board({
  size,
  onReady,
  onMove,
}: {
  size: number
  onReady: (api: Api) => void
  onMove: (from: string, to: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  useEffect(() => {
    const cg = Chessground(el.current!, {
      coordinates: true,
      animation: { duration: 180 },
      highlight: { lastMove: true, check: true },
      draggable: { showGhost: true },
      movable: { free: false, dests: new Map() },
      events: { move: (from, to) => onMoveRef.current(from, to) },
    })
    ;(window as any).cmMove = (f: string, t: string) => onMoveRef.current(f, t) // dev hook: drive the board headlessly
    onReady(cg)
    return () => cg.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={el} style={{ width: size, height: size }} />
}
