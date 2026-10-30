import { useMemo } from 'react'
import { LABELS, summarise, type PlyAnalysis } from '../lib/analysis'
import type { Ply } from '../lib/pgn'

type ReportProps = {
  plies: Ply[]
  analyses: PlyAnalysis[]
  headers: Record<string, string>
  running: boolean
  onSelect: (index: number) => void
}

const ORDER = ['blunder', 'miss', 'mistake', 'inaccuracy'] as const

function countsText(counts: Record<string, number>): string {
  const parts: string[] = []
  for (const key of ORDER) {
    const value = counts[key] ?? 0
    if (!value) continue
    const label = LABELS[key].name.toLowerCase()
    parts.push(`${value} ${label}${value === 1 ? '' : 's'}`)
  }
  return parts.length ? parts.join(' · ') : 'no significant errors'
}

export function Report({ plies, analyses, headers, running, onSelect }: ReportProps) {
  const summary = useMemo(() => summarise(plies, analyses), [plies, analyses])

  const keyMoments = useMemo(() => {
    const mistakes = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])
    return [...analyses]
      .filter((analysis) => mistakes.has(analysis.label))
      .sort((a, b) => b.winLoss - a.winLoss)
      .slice(0, 3)
  }, [analyses])

  const players = [
    { color: 'w' as const, name: headers.White || 'White', side: summary.w },
    { color: 'b' as const, name: headers.Black || 'Black', side: summary.b },
  ]

  return (
    <div className="card report">
      <div className="card-head">
        <h2>Game report</h2>
        {running && <span className="hint">analysing…</span>}
      </div>

      {players.map((player) => (
        <div className="player" key={player.color}>
          <div className={`player-dot ${player.color === 'w' ? 'dot-white' : 'dot-black'}`} />
          <div className="player-main">
            <div className="player-name">{player.name}</div>
            <div className="player-meta">{countsText(player.side.counts)}</div>
          </div>
          <div className="player-score">
            <div className="accuracy">{player.side.accuracy.toFixed(1)}</div>
            <div className="player-meta">ACPL {player.side.acpl.toFixed(0)}</div>
          </div>
        </div>
      ))}

      <div className="key-moments">
        <h3>Key moments</h3>
        {keyMoments.length === 0 && (
          <p className="hint">
            {analyses.length
              ? 'No significant errors in this game.'
              : 'Run an analysis to see the turning points.'}
          </p>
        )}
        {keyMoments.map((analysis) => {
          const ply = plies[analysis.index - 1]
          if (!ply) return null
          return (
            <button
              type="button"
              className={`moment tone-${analysis.label}`}
              key={analysis.index}
              onClick={() => onSelect(analysis.index)}
            >
              <span className="moment-move">
                {ply.moveNumber}
                {ply.color === 'w' ? '.' : '...'} {ply.san}
              </span>
              <span className="moment-tag">{LABELS[analysis.label].name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
