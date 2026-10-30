export type EvalWhite = { cp: number; mate: number | null }

export type SearchResult = EvalWhite & {
  bestMove: string
  pv: string[]
}

import { parseBestMove, parseInfoLine } from './uci'

export { mateToCp } from './uci'

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

type ActiveCommand = {
  isDone: (line: string) => boolean
  onLine: ((line: string) => void) | undefined
  resolve: (lines: string[]) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function toLine(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as { data: unknown }).data
    if (typeof inner === 'string') return inner
  }
  return ''
}

/**
 * Minimal promise-based UCI client. Commands are strictly serialised: one
 * search (or handshake) at a time, which is all a single-threaded engine wants.
 */
export class Engine {
  private worker: Worker
  private active: ActiveCommand | null = null
  private destroyed = false

  constructor() {
    this.worker = new Worker(ENGINE_URL)
    this.worker.onmessage = (event: MessageEvent) => {
      const line = toLine(event.data)
      if (line) this.dispatch(line)
    }
    this.worker.onerror = () => {
      this.fail(new Error('The chess engine worker crashed while loading.'))
    }
  }

  private dispatch(line: string) {
    const active = this.active
    if (!active) return
    active.onLine?.(line)
    if (active.isDone(line)) {
      clearTimeout(active.timer)
      this.active = null
      active.resolve([line])
    }
  }

  private fail(error: Error) {
    const active = this.active
    if (!active) return
    clearTimeout(active.timer)
    this.active = null
    active.reject(error)
  }

  private run(
    commands: string[],
    isDone: (line: string) => boolean,
    options: { timeout: number; onLine?: (line: string) => void },
  ): Promise<string[]> {
    if (this.destroyed) return Promise.reject(new Error('The engine is closed.'))
    if (this.active) return Promise.reject(new Error('The engine is already busy.'))

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.active = null
        reject(new Error('The chess engine stopped responding.'))
      }, options.timeout)

      this.active = { isDone, onLine: options.onLine, resolve, reject, timer }
      for (const command of commands) this.worker.postMessage(command)
    })
  }

  /** Handshake; retries because the worker boots the WASM module asynchronously. */
  async init(): Promise<void> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await this.run(['uci'], (line) => line.trim() === 'uciok', { timeout: 5000 })
        await this.run(['isready'], (line) => line.trim() === 'readyok', { timeout: 20000 })
        return
      } catch (error) {
        lastError = error
        this.worker?.terminate()
        this.worker = new Worker(ENGINE_URL)
        this.worker.onmessage = (event: MessageEvent) => {
          const line = toLine(event.data)
          if (line) this.dispatch(line)
        }
        this.worker.onerror = () => {
          this.fail(new Error('The chess engine worker crashed while loading.'))
        }
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('The chess engine could not start in this browser.')
  }

  /** Fixed-depth search of one position. Scores are returned from White's view. */
  async analyse(fen: string, depth: number): Promise<SearchResult> {
    const turn = fen.split(' ')[1] === 'b' ? -1 : 1
    let cp = 0
    let mate: number | null = null
    let pv: string[] = []
    let bestMove = ''

    await this.run(
      [`position fen ${fen}`, `go depth ${depth}`],
      (line) => line.startsWith('bestmove'),
      {
        timeout: 240000,
        onLine: (line) => {
          if (line.startsWith('bestmove')) {
            bestMove = parseBestMove(line)
            return
          }
          const parsed = parseInfoLine(line)
          if (!parsed) return
          cp = parsed.cp
          mate = parsed.mate
          if (parsed.pv.length) pv = parsed.pv
        },
      },
    )

    return {
      cp: cp * turn,
      mate: mate === null ? null : mate * turn,
      bestMove,
      pv,
    }
  }

  destroy() {
    this.destroyed = true
    this.fail(new Error('The engine was closed.'))
    this.worker.terminate()
  }
}
