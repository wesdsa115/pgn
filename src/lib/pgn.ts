import { Chess, type Move } from 'chess.js'

export type Ply = {
  index: number
  moveNumber: number
  color: 'w' | 'b'
  san: string
  uci: string
  from: string
  to: string
  fenBefore: string
  fenAfter: string
}

export type ParsedGame = {
  headers: Record<string, string>
  startFen: string
  plies: Ply[]
}

export function parsePgn(pgn: string): ParsedGame {
  const text = pgn.trim()
  if (!text) throw new Error('Paste a PGN first.')

  const reader = new Chess()
  try {
    reader.loadPgn(text)
  } catch {
    throw new Error('That PGN could not be parsed. Check the move list and headers.')
  }

  const headers = reader.header() as Record<string, string>
  const moves = reader.history({ verbose: true })
  if (!moves.length) throw new Error('That PGN does not contain any moves.')

  const startFen = headers.FEN ?? new Chess().fen()
  const board = new Chess(startFen)
  const plies: Ply[] = []

  for (const move of moves) {
    const fenBefore = board.fen()
    let played: Move | null = null
    try {
      played = board.move(move.san) ?? null
    } catch {
      played = null
    }
    if (!played) throw new Error(`Illegal or unreadable move in the PGN: ${move.san}`)

    plies.push({
      index: plies.length + 1,
      moveNumber: Number(fenBefore.split(' ')[5]),
      color: played.color,
      san: played.san,
      uci: `${played.from}${played.to}${played.promotion ?? ''}`,
      from: played.from,
      to: played.to,
      fenBefore,
      fenAfter: board.fen(),
    })
  }

  return { headers, startFen, plies }
}
