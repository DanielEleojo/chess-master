import type { ReactNode } from 'react'

// One top bar for every mode. Each mode used to hide its own "Home" button
// somewhere in a sidebar or a done-screen, so the way out moved as you played.
export function ModeHead({
  title,
  sub,
  right,
  onExit,
}: {
  title: string
  sub?: ReactNode
  right?: ReactNode
  onExit: () => void
}) {
  return (
    <header className="modehead">
      <button className="back" onClick={onExit} aria-label="Back to home">
        ←
      </button>
      <div className="grow">
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  )
}
