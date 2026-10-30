import { formatEval, winProbability } from '../lib/analysis'

type EvalBarProps = {
  cp: number
  mate: number | null
}

export function EvalBar({ cp, mate }: EvalBarProps) {
  const whiteShare = Math.max(0.03, Math.min(0.97, winProbability(cp)))

  return (
    <div className="evalbar" title={`Evaluation: ${formatEval(cp, mate)}`}>
      <div className="evalbar-black" />
      <div className="evalbar-white" style={{ height: `${whiteShare * 100}%` }} />
      <span className="evalbar-label">{formatEval(cp, mate)}</span>
    </div>
  )
}
