import { LABELS, type PlyAnalysis } from '../lib/analysis'
import type { Ply } from '../lib/pgn'

type MoveListProps = {
  plies: Ply[]
  analyses: Record<number, PlyAnalysis>
  current: number
  onSelect: (index: number) => void
}

type Row = { number: number; white?: Ply; black?: Ply }

function buildRows(plies: Ply[]): Row[] {
  const rows: Row[] = []
  for (const ply of plies) {
    const last = rows[rows.length - 1]
    if (ply.color === 'w' || !last) {
      rows.push({ number: ply.moveNumber, white: ply.color === 'w' ? ply : undefined })
      if (ply.color === 'b') rows[rows.length - 1].black = ply
    } else {
      last.black = ply
    }
  }
  return rows
}

function MoveCell({
  ply,
  analysis,
  current,
  onSelect,
}: {
  ply?: Ply
  analysis?: PlyAnalysis
  current: number
  onSelect: (index: number) => void
}) {
  if (!ply) return <span className="move move-empty" />

  return (
    <button
      type="button"
      className={`move${ply.index === current ? ' move-active' : ''}${
        analysis ? ` tone-${analysis.label}` : ''
      }`}
      onClick={() => onSelect(ply.index)}
    >
      <span className="move-san">{ply.san}</span>
      {analysis && (
        <span className="move-badge" title={LABELS[analysis.label].name}>
          {LABELS[analysis.label].symbol}
        </span>
      )}
    </button>
  )
}

export function MoveList({ plies, analyses, current, onSelect }: MoveListProps) {
  const rows = buildRows(plies)

  return (
    <div className="card moves-card">
      <div className="card-head">
        <h2>Moves</h2>
        <span className="hint">click to review</span>
      </div>
      <div className="moves">
        {rows.map((row, index) => (
          <div className="move-row" key={`${row.number}-${index}`}>
            <span className="move-number">{row.number}.</span>
            <MoveCell
              ply={row.white}
              analysis={row.white ? analyses[row.white.index] : undefined}
              current={current}
              onSelect={onSelect}
            />
            <MoveCell
              ply={row.black}
              analysis={row.black ? analyses[row.black.index] : undefined}
              current={current}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
