/** UCI output parsing, kept free of worker/browser dependencies so it can be tested. */

const MATE_BASE = 10000

/** Mate distance -> a centipawn score that always beats a normal evaluation. */
export function mateToCp(mate: number): number {
  return mate > 0 ? MATE_BASE - mate * 10 : -MATE_BASE - mate * 10
}

export type UciScore = {
  /** Centipawns from the side to move. */
  cp: number
  /** Mate distance from the side to move, or null. */
  mate: number | null
  pv: string[]
}

export function parseInfoLine(line: string): UciScore | null {
  if (!line.startsWith('info ')) return null
  // Bound lines report an upper/lower estimate, not a real score.
  if (line.includes('bound')) return null

  const score = / score (cp|mate) (-?\d+)/.exec(line)
  if (!score) return null

  const mate = score[1] === 'cp' ? null : Number(score[2])
  const cp = mate === null ? Number(score[2]) : mateToCp(mate)
  const pvMatch = / pv (.+)$/.exec(line)
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : []

  return { cp, mate, pv }
}

export function parseBestMove(line: string): string {
  return line.split(/\s+/)[1] ?? ''
}
