import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { MoveList } from './components/MoveList'
import { Report } from './components/Report'
import {
  LABELS,
  analysePly,
  describe,
  formatEval,
  summarise,
  type PlyAnalysis,
} from './lib/analysis'
import { listVoices, speak, speechSupported, stopSpeaking, type VoiceOption } from './lib/coach'
import { Engine, type SearchResult } from './lib/engine'
import { parsePgn, type ParsedGame } from './lib/pgn'
import { SAMPLE_GAMES } from './lib/samples'

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const DEPTHS = [
  { value: 10, label: 'Fast — depth 10' },
  { value: 12, label: 'Quick — depth 12' },
  { value: 14, label: 'Standard — depth 14' },
  { value: 16, label: 'Deep — depth 16' },
  { value: 18, label: 'Very deep — depth 18' },
]

export default function App() {
  const [pgnText, setPgnText] = useState(SAMPLE_GAMES[0].pgn)
  const [game, setGame] = useState<ParsedGame | null>(null)
  const [analyses, setAnalyses] = useState<Record<number, PlyAnalysis>>({})
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [plyIndex, setPlyIndex] = useState(0)
  const [depth, setDepth] = useState(14)
  const [flipped, setFlipped] = useState(false)
  const [narrate, setNarrate] = useState(true)
  const [rate, setRate] = useState(1)
  const [voiceURI, setVoiceURI] = useState('')
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [playing, setPlaying] = useState(false)

  const engineRef = useRef<Engine | null>(null)
  const abortRef = useRef(false)
  const lastSpokenRef = useRef('')

  // The playback loop outlives individual renders, so it reads live values
  // from refs instead of closing over stale state.
  const plyIndexRef = useRef(0)
  const analysesRef = useRef<Record<number, PlyAnalysis>>({})
  const runningRef = useRef(false)
  const playingRef = useRef(false)
  const voiceRef = useRef({ rate, voiceURI })
  const playRunRef = useRef(0)

  useEffect(() => {
    plyIndexRef.current = plyIndex
  }, [plyIndex])

  useEffect(() => {
    analysesRef.current = analyses
  }, [analyses])

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    voiceRef.current = { rate, voiceURI }
  }, [rate, voiceURI])

  const analysisList = useMemo(
    () => Object.values(analyses).sort((a, b) => a.index - b.index),
    [analyses],
  )

  const maxPly = game ? game.plies.length : 0
  const currentPly = game && plyIndex > 0 ? game.plies[plyIndex - 1] : null
  const currentAnalysis = plyIndex > 0 ? analyses[plyIndex] : undefined

  useEffect(() => {
    if (!speechSupported()) return
    const load = () => setVoices(listVoices())
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  useEffect(() => {
    return () => {
      engineRef.current?.destroy()
      engineRef.current = null
      stopSpeaking()
    }
  }, [])

  const commentary = useMemo(() => {
    if (!game || !currentPly || !currentAnalysis) return ''
    return describe(currentPly, currentAnalysis, game.headers)
  }, [game, currentPly, currentAnalysis])

  useEffect(() => {
    // Hands-free playback narrates for itself; this effect is for manual stepping.
    // `playing` is read from a ref rather than the deps so that pausing or
    // finishing a playback does not re-read the move it stopped on.
    if (playingRef.current || !narrate || !commentary) return
    const key = `${plyIndex}:${commentary}`
    if (lastSpokenRef.current === key) return
    lastSpokenRef.current = key
    void speak(commentary, { rate, voiceURI })
  }, [commentary, narrate, plyIndex, rate, voiceURI])

  /**
   * Hands-free playback: step the board once per move, wait for that move's
   * analysis if it is still streaming, then speak its commentary and move on.
   * Pausing cancels in-flight speech; resuming continues from where it stopped.
   */
  useEffect(() => {
    if (!playing || !game) return

    const runId = playRunRef.current + 1
    playRunRef.current = runId
    let cancelled = false
    const isCurrent = () => !cancelled && playRunRef.current === runId

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms)
      })

    // Results stream in, so a ply may not be analysed the moment we reach it.
    const analysisFor = async (index: number): Promise<PlyAnalysis | undefined> => {
      let waited = 0
      while (isCurrent() && !analysesRef.current[index] && runningRef.current && waited < 6000) {
        await sleep(150)
        waited += 150
      }
      return analysesRef.current[index]
    }

    void (async () => {
      const plies = game.plies
      let index = plyIndexRef.current >= plies.length ? 0 : plyIndexRef.current

      while (isCurrent() && index < plies.length) {
        index += 1
        setPlyIndex(index)

        const ply = plies[index - 1]
        const analysis = await analysisFor(index)
        if (!isCurrent()) return

        const settings = voiceRef.current
        const text = analysis ? describe(ply, analysis, game.headers) : ''
        // Browsers occasionally drop `end` on long utterances, so cap the wait
        // instead of hanging the walkthrough on a speech event that never comes.
        const spoke = text
          ? await Promise.race([
              speak(text, settings),
              sleep(1500 + text.length * 90).then(() => false),
            ])
          : false
        if (!isCurrent()) return

        // Without speech there is nothing to wait on, so hold the move on screen
        // long enough to read; with speech the utterance sets the pace.
        if (!spoke) await sleep(1500 / Math.max(0.6, settings.rate))
        await sleep(240)
      }

      if (isCurrent()) setPlaying(false)
    })()

    return () => {
      cancelled = true
      stopSpeaking()
    }
  }, [playing, game])

  const runAnalysis = useCallback(async () => {
    setError('')
    setPlaying(false)
    setAnalyses({})
    setProgress(0)
    lastSpokenRef.current = ''

    let parsed: ParsedGame
    try {
      parsed = parsePgn(pgnText)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'That PGN could not be read.')
      return
    }

    setGame(parsed)
    setPlyIndex(0)
    setTotal(parsed.plies.length + 1)
    setRunning(true)
    abortRef.current = false

    if (!engineRef.current) engineRef.current = new Engine()
    const engine = engineRef.current

    try {
      await engine.init()
      const fens = [parsed.startFen, ...parsed.plies.map((ply) => ply.fenAfter)]
      const results: Record<number, PlyAnalysis> = {}
      let previous: SearchResult | null = null

      for (let i = 0; i < fens.length; i += 1) {
        if (abortRef.current) break
        const result = await engine.analyse(fens[i], depth)

        if (previous) {
          const ply = parsed.plies[i - 1]
          results[ply.index] = analysePly(ply, previous, result, previous.bestMove)
          setAnalyses({ ...results })
        }

        previous = result
        setProgress(i + 1)
      }
    } catch (engineError) {
      setError(
        engineError instanceof Error
          ? engineError.message
          : 'The engine failed while analysing this game.',
      )
    } finally {
      setRunning(false)
    }
  }, [depth, pgnText])

  const stopAnalysis = () => {
    abortRef.current = true
  }

  const go = useCallback(
    (index: number) => {
      // Jumping elsewhere by hand takes over from hands-free playback.
      setPlaying(false)
      setPlyIndex(Math.max(0, Math.min(maxPly, index)))
    },
    [maxPly],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(plyIndexRef.current + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(plyIndexRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go])

  const boardFen = game
    ? plyIndex === 0
      ? game.startFen
      : game.plies[plyIndex - 1].fenAfter
    : DEFAULT_FEN

  const lastMove = currentPly ? { from: currentPly.from, to: currentPly.to } : null
  const arrow =
    currentAnalysis && currentAnalysis.label !== 'best' && currentAnalysis.bestUci.length >= 4
      ? { from: currentAnalysis.bestUci.slice(0, 2), to: currentAnalysis.bestUci.slice(2, 4) }
      : null

  const evalNow = currentAnalysis
    ? { cp: currentAnalysis.cpAfter, mate: currentAnalysis.mateAfter }
    : game && analyses[1]
      ? { cp: analyses[1].cpBefore, mate: analyses[1].mateBefore }
      : { cp: 0, mate: null as number | null }

  const report = useMemo(
    () => (game ? summarise(game.plies, analysisList) : null),
    [analysisList, game],
  )

  const readAloud = () => {
    if (!commentary) return
    lastSpokenRef.current = `${plyIndex}:${commentary}`
    void speak(commentary, { rate, voiceURI })
  }

  const toggleNarration = () => {
    const next = !narrate
    setNarrate(next)
    lastSpokenRef.current = ''
    if (!next) stopSpeaking()
  }

  const canPlay = Boolean(game) && analysisList.length > 0

  const togglePlayback = () => {
    if (!canPlay) return
    lastSpokenRef.current = ''
    setPlaying((value) => !value)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">♞</span>
          <div>
            <h1>PGN Coach</h1>
            <p>Stockfish analysis with spoken commentary. Nothing leaves your browser.</p>
          </div>
        </div>
        <div className="topbar-note">
          {running
            ? `Analysing position ${progress} of ${total}`
            : playing
              ? `Narrating move ${Math.min(plyIndex, maxPly)} of ${maxPly}`
              : analysisList.length
                ? `${analysisList.length} moves analysed`
                : 'Ready'}
        </div>
      </header>

      <section className="card input-card">
        <div className="card-head">
          <h2>Game</h2>
          <select
            className="sample-select"
            value=""
            onChange={(event) => {
              const sample = SAMPLE_GAMES.find((item) => item.name === event.target.value)
              if (sample) setPgnText(sample.pgn)
            }}
          >
            <option value="">Load a sample…</option>
            {SAMPLE_GAMES.map((sample) => (
              <option key={sample.name} value={sample.name}>
                {sample.name}
              </option>
            ))}
          </select>
        </div>

        <textarea
          className="pgn-input"
          value={pgnText}
          spellCheck={false}
          onChange={(event) => setPgnText(event.target.value)}
          placeholder='Paste a PGN here, e.g. 1. e4 e5 2. Nf3 Nc6 3. Bb5 …'
        />

        <div className="input-actions">
          <select
            className="depth-select"
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
            disabled={running}
          >
            {DEPTHS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={runAnalysis} disabled={running}>
            {running ? 'Analysing…' : 'Analyse game'}
          </button>
          {running && (
            <button type="button" className="btn" onClick={stopAnalysis}>
              Stop
            </button>
          )}
          <span className="hint">Deeper settings are slower; results stream in as they finish.</span>
        </div>

        {running && (
          <div className="progress">
            <div
              className="progress-fill"
              style={{ width: `${total ? (progress / total) * 100 : 0}%` }}
            />
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </section>

      <div className="workspace">
        <section className="board-col">
          <div className="board-row">
            <EvalBar cp={evalNow.cp} mate={evalNow.mate} />
            <Board fen={boardFen} flipped={flipped} lastMove={lastMove} arrow={arrow} />
          </div>

          <div className="controls">
            <button type="button" className="btn btn-icon" onClick={() => go(0)} title="Start">
              ⏮
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => go(plyIndex - 1)}
              title="Previous move"
            >
              ◀
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => go(plyIndex + 1)}
              title="Next move"
            >
              ▶
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => go(maxPly)}
              title="End"
            >
              ⏭
            </button>
            <button type="button" className="btn" onClick={() => setFlipped((value) => !value)}>
              Flip board
            </button>
          </div>

          <div className="card commentary">
            <div className="card-head">
              <h2>
                {currentPly
                  ? `${currentPly.moveNumber}${currentPly.color === 'w' ? '.' : '...'} ${currentPly.san}`
                  : 'Starting position'}
              </h2>
              {currentAnalysis && (
                <span className={`badge tone-${currentAnalysis.label}`}>
                  {LABELS[currentAnalysis.label].name}
                </span>
              )}
            </div>

            <p className="coach-text">
              {commentary ||
                (game
                  ? 'Step to a move to hear the coach.'
                  : 'Paste a PGN and hit “Analyse game” to get started.')}
            </p>

            <div className="eval-row">
              <span>Evaluation {formatEval(evalNow.cp, evalNow.mate)}</span>
              {currentAnalysis && (
                <span>
                  Engine wanted <strong>{currentAnalysis.bestSan}</strong>
                </span>
              )}
            </div>

            <div className="voice-controls">
              <button
                type="button"
                className={`btn btn-play${playing ? ' is-playing' : ''}`}
                onClick={togglePlayback}
                disabled={!canPlay}
                title={
                  playing
                    ? 'Pause the hands-free walkthrough'
                    : 'Play through every move, hands-free'
                }
              >
                {playing ? '❚❚ Pause' : '▶ Play through'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={readAloud}
                disabled={!commentary || !speechSupported()}
              >
                🔊 Read this move
              </button>
              <label className="toggle">
                <input type="checkbox" checked={narrate} onChange={toggleNarration} />
                Narrate as I step
              </label>
              <label className="rate">
                Speed
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.1}
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                />
              </label>
              <select
                className="voice-select"
                value={voiceURI}
                onChange={(event) => setVoiceURI(event.target.value)}
                disabled={!voices.length}
              >
                <option value="">System voice</option>
                {voices.map((voice) => (
                  <option key={voice.uri} value={voice.uri}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>
            {!speechSupported() && (
              <p className="hint">This browser has no speech synthesis, so narration is off.</p>
            )}
          </div>
        </section>

        <aside className="side-col">
          {game && report && (
            <Report
              plies={game.plies}
              analyses={analysisList}
              headers={game.headers}
              running={running}
              onSelect={go}
            />
          )}
          {game ? (
            <MoveList plies={game.plies} analyses={analyses} current={plyIndex} onSelect={go} />
          ) : (
            <div className="card empty-card">
              <h2>No game loaded</h2>
              <p className="hint">
                The sample game is pre-filled above — press “Analyse game”, then click any move to
                hear the coach explain it.
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="footer">
        <span>
          Powered by Stockfish 19 (WASM, GPL-3.0) · commentary generated from engine output ·
          speech via your browser
        </span>
      </footer>
    </div>
  )
}
