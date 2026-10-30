type BoardProps = {
  fen: string
  flipped: boolean
  lastMove: { from: string; to: string } | null
  arrow: { from: string; to: string } | null
}

const GLYPH: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

function gridFromFen(fen: string): (string | null)[][] {
  return fen
    .split(' ')[0]
    .split('/')
    .map((row) => {
      const cells: (string | null)[] = []
      for (const char of row) {
        if (char >= '1' && char <= '8') {
          for (let i = 0; i < Number(char); i += 1) cells.push(null)
        } else {
          cells.push(char)
        }
      }
      return cells
    })
}

function arrowGeometry(from: string, to: string, flipped: boolean) {
  const center = (square: string) => {
    const file = square.charCodeAt(0) - 97
    const rank = Number(square[1]) - 1
    const col = flipped ? 7 - file : file
    const row = flipped ? rank : 7 - rank
    return { x: col + 0.5, y: row + 0.5 }
  }

  const start = center(from)
  const end = center(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length

  const tail = { x: start.x + ux * 0.32, y: start.y + uy * 0.32 }
  const tip = { x: end.x - ux * 0.4, y: end.y - uy * 0.4 }
  const head = 0.32
  const base = { x: tip.x - ux * head, y: tip.y - uy * head }
  const perp = { x: -uy, y: ux }

  return {
    line: { x1: tail.x, y1: tail.y, x2: base.x, y2: base.y },
    head: [
      `${tip.x},${tip.y}`,
      `${base.x + perp.x * head * 0.64},${base.y + perp.y * head * 0.64}`,
      `${base.x - perp.x * head * 0.64},${base.y - perp.y * head * 0.64}`,
    ].join(' '),
  }
}

export function Board({ fen, flipped, lastMove, arrow }: BoardProps) {
  const grid = gridFromFen(fen)
  const squares: { name: string; piece: string | null; dark: boolean }[] = []

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const sourceRow = flipped ? 7 - row : row
      const sourceCol = flipped ? 7 - col : col
      squares.push({
        name: `${'abcdefgh'[sourceCol]}${8 - sourceRow}`,
        piece: grid[sourceRow]?.[sourceCol] ?? null,
        dark: (sourceRow + sourceCol) % 2 === 1,
      })
    }
  }

  const geometry = arrow ? arrowGeometry(arrow.from, arrow.to, flipped) : null

  return (
    <div className="board-wrap">
      <div className="board">
        {squares.map((square) => {
          const isLast =
            lastMove !== null && (square.name === lastMove.from || square.name === lastMove.to)
          const piece = square.piece
          return (
            <div
              key={square.name}
              className={`sq ${square.dark ? 'sq-dark' : 'sq-light'}${isLast ? ' sq-last' : ''}`}
            >
              {piece && (
                <span className={`piece ${piece === piece.toUpperCase() ? 'piece-w' : 'piece-b'}`}>
                  {GLYPH[piece.toLowerCase()]}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {geometry && (
        <svg className="board-arrow" viewBox="0 0 8 8" aria-hidden="true">
          <line
            x1={geometry.line.x1}
            y1={geometry.line.y1}
            x2={geometry.line.x2}
            y2={geometry.line.y2}
            strokeWidth={0.17}
            strokeLinecap="round"
          />
          <polygon points={geometry.head} />
        </svg>
      )}
    </div>
  )
}
