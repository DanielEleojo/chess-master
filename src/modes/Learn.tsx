import { useState } from 'react'
import { ModeHead } from '../components/ModeHead'
import type { LearnData } from '../lib/learn'

// Teach an opening (030): a text-only reading surface, no board — a system
// picker into plans / pawn breaks / key squares for each of the three systems.
export function Learn({ learn, onExit }: { learn: LearnData; onExit: () => void }) {
  const [sys, setSys] = useState<string | null>(null)

  if (sys) {
    const brief = learn.systems[sys]
    return (
      <>
        <ModeHead title={sys} sub="plans · pawn breaks · key squares" onExit={() => setSys(null)} />
        <div className="learnbriefs">
          <div className="panel">
            <b>Plans</b>
            <p>{brief.plans}</p>
          </div>
          <div className="panel">
            <b>Pawn breaks</b>
            <p>{brief.pawnBreaks}</p>
          </div>
          <div className="panel">
            <b>Key squares</b>
            <p>{brief.keySquares}</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ModeHead title="Learn" sub="pick a system to read its overview" onExit={onExit} />
      <div className="ledger">
        {Object.keys(learn.systems).map((s) => (
          <button key={s} className="row" onClick={() => setSys(s)}>
            <span className="name">{s}</span>
            <span className="what">plans, typical pawn breaks, and key squares</span>
          </button>
        ))}
      </div>
    </>
  )
}
