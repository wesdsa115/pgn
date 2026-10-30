import { Chess } from 'chess.js'
import type { SearchResult } from './engine'
import type { Ply } from './pgn'

export type Label =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'

export const LABELS: Record<Label, { name: string; symbol: string }> = {
  best: { name: 'Best', symbol: '★' },
  excellent: { name: 'Excellent', symbol: '!' },
  good: { name: 'Good', symbol: '✓' },
  inaccuracy: { name: 'Inaccuracy', symbol: '?!' },
  mistake: { name: 'Mistake', symbol: '?' },
  blunder: { name: 'Blunder', symbol: '??' },
  miss: { name: 'Miss', symbol: '×' },
}

export type PlyAnalysis = {
  index: number
  label: Label
  cpBefore: number
  cpAfter: number
  mateBefore: number | null
  mateAfter: number | null
  winLoss: number
  cpLoss: number
  playedUci: string
  bestUci: string
  bestSan: string
  bestLine: string[]
}

/** Centipawns to a 0..1 expected score, White's point of view. */
export function winProbability(cp: number): number {
  const clamped = Math.max(-1500, Math.min(1500, cp))
  return 1 / (1 + Math.pow(10, -clamped / 400))
}

/** Win-probability drop thresholds used for the move labels. */
const THRESHOLD = {
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
}

function sanFor(fen: string, uci: string): string {
  if (!uci || uci === '(none)' || uci.length < 4) return '—'
  const game = new Chess(fen)
  try {
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    })
    return move.san
  } catch {
    return uci
  }
}

function pvToSan(fen: string, pv: string[], max: number): string[] {
  const game = new Chess(fen)
  const out: string[] = []
  for (const uci of pv.slice(0, max)) {
    if (uci.length < 4) break
    try {
      const move = game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      })
      out.push(move.san)
    } catch {
      break
    }
  }
  return out
}

export function analysePly(
  ply: Ply,
  before: SearchResult,
  after: SearchResult,
  bestUci: string,
): PlyAnalysis {
  const mover = ply.color === 'w' ? 1 : -1
  const cpBeforeMover = before.cp * mover
  const cpAfterMover = after.cp * mover
  const winLoss = Math.max(0, winProbability(cpBeforeMover) - winProbability(cpAfterMover))

  const isBest = bestUci === ply.uci
  const hadMate = before.mate !== null && before.mate * mover > 0

  let label: Label
  if (isBest) label = 'best'
  else if (hadMate) label = 'miss'
  else if (winLoss < THRESHOLD.excellent) label = 'excellent'
  else if (winLoss < THRESHOLD.good) label = 'good'
  else if (winLoss < THRESHOLD.inaccuracy) label = 'inaccuracy'
  else if (winLoss < THRESHOLD.mistake) label = 'mistake'
  else label = 'blunder'

  return {
    index: ply.index,
    label,
    cpBefore: before.cp,
    cpAfter: after.cp,
    mateBefore: before.mate,
    mateAfter: after.mate,
    winLoss,
    cpLoss: Math.max(0, Math.min(1000, cpBeforeMover - cpAfterMover)),
    playedUci: ply.uci,
    bestUci,
    bestSan: sanFor(ply.fenBefore, bestUci),
    bestLine: pvToSan(ply.fenBefore, before.pv, 4),
  }
}

export function formatEval(cp: number, mate: number | null): string {
  // A mate score of 0 means the side to move is already checkmated.
  if (mate === 0) return '#'
  if (mate !== null) return `${mate > 0 ? 'M' : '-M'}${Math.abs(mate)}`
  const pawns = Math.max(-30, Math.min(30, cp / 100))
  const rounded = Math.abs(pawns) < 0.05 ? 0 : pawns
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}`
}

export type SideSummary = {
  moves: number
  accuracy: number
  acpl: number
  counts: Record<Label, number>
}

function emptyCounts(): Record<Label, number> {
  return {
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
  }
}

/**
 * Per-move accuracy from the expected-score drop, in percentage points.
 * The familiar chess.com-shaped curve, applied to win probability rather than
 * centipawns (feeding it raw centipawns produces absurd single-digit scores).
 */
export function moveAccuracy(winLoss: number): number {
  const value = 103.1668 * Math.exp(-0.04354 * winLoss * 100) - 3.1669
  return Math.max(0, Math.min(100, value))
}

export function summarise(
  plies: Ply[],
  analyses: PlyAnalysis[],
): Record<'w' | 'b', SideSummary> {
  const sides: Record<'w' | 'b', SideSummary> = {
    w: { moves: 0, accuracy: 100, acpl: 0, counts: emptyCounts() },
    b: { moves: 0, accuracy: 100, acpl: 0, counts: emptyCounts() },
  }

  let whiteLoss = 0
  let blackLoss = 0
  let whiteAccuracy = 0
  let blackAccuracy = 0

  for (const analysis of analyses) {
    const ply = plies[analysis.index - 1]
    if (!ply) continue
    const side = sides[ply.color]
    side.moves += 1
    side.counts[analysis.label] += 1
    const accuracy = moveAccuracy(analysis.winLoss)
    if (ply.color === 'w') {
      whiteLoss += analysis.cpLoss
      whiteAccuracy += accuracy
    } else {
      blackLoss += analysis.cpLoss
      blackAccuracy += accuracy
    }
  }

  sides.w.acpl = sides.w.moves ? whiteLoss / sides.w.moves : 0
  sides.b.acpl = sides.b.moves ? blackLoss / sides.b.moves : 0
  sides.w.accuracy = sides.w.moves ? whiteAccuracy / sides.w.moves : 100
  sides.b.accuracy = sides.b.moves ? blackAccuracy / sides.b.moves : 100

  return sides
}

function pawnsText(pawns: number): string {
  if (pawns >= 8) return 'a decisive amount'
  const rounded = Math.max(0.1, Math.round(pawns * 10) / 10)
  return `${rounded} ${rounded === 1 ? 'pawn' : 'pawns'}`
}

function evalSentence(analysis: PlyAnalysis): string {
  if (analysis.mateAfter === 0) return 'That is checkmate.'
  if (analysis.mateAfter !== null) {
    return `There is now a forced mate for ${analysis.mateAfter > 0 ? 'White' : 'Black'}.`
  }
  return `The evaluation is ${formatEval(analysis.cpAfter, null)}.`
}

/** Coach prose for one move, grounded entirely in the engine numbers. */
export function describe(
  ply: Ply,
  analysis: PlyAnalysis,
  headers: Record<string, string>,
): string {
  const name = (ply.color === 'w' ? headers.White : headers.Black) || 'The player'
  const prefix = `${ply.moveNumber}${ply.color === 'w' ? '.' : '...'} ${ply.san}`
  const better = analysis.bestSan
  const line = analysis.bestLine.length ? analysis.bestLine.join(' ') : better
  const pawns = Math.abs(analysis.cpBefore - analysis.cpAfter) / 100
  const mateAgainst =
    analysis.mateAfter !== null && analysis.mateAfter * (ply.color === 'w' ? -1 : 1) > 0

  switch (analysis.label) {
    case 'best':
      return `${prefix} is the engine's top move — exactly what it wanted. ${evalSentence(analysis)}`
    case 'excellent':
      return `${prefix} is excellent. ${better} was the top choice, but the evaluation barely moves. ${evalSentence(analysis)}`
    case 'good':
      return `${prefix} is fine. ${better} was a touch more precise. ${evalSentence(analysis)}`
    case 'inaccuracy':
      return `${prefix} is an inaccuracy, giving back about ${pawnsText(pawns)}. ${better} was better. ${evalSentence(analysis)}`
    case 'mistake':
      return `${prefix} is a mistake — a swing of roughly ${pawnsText(pawns)}. ${better} had to be played. The engine's line was ${line}. ${evalSentence(analysis)}`
    case 'blunder':
      return `${prefix} is a blunder, ${name}. It costs about ${pawnsText(pawns)} of evaluation. ${better} was the move. The engine's line was ${line}. ${evalSentence(analysis)}${mateAgainst ? ' Your opponent now has a forced mate.' : ''}`
    case 'miss':
      return `${prefix} misses the win. ${better} was winning on the spot: ${line}. ${evalSentence(analysis)}`
    default:
      return `${prefix}. ${evalSentence(analysis)}`
  }
}
