# PGN Coach

Paste a chess PGN and get a chess.com-style game report — evaluated moves, an
accuracy score, key moments — plus a spoken coach that explains each move out
loud. Everything runs in the browser: no server, no API keys, and the PGN never
leaves your machine.

## Run it

```bash
bun install     # also copies the engine into public/engine via postinstall
bun run dev     # http://localhost:5173
bun run build   # typecheck + production bundle

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, import the repo and use these settings:
   - Framework preset: **Other**
   - Build command: `bun run build`
   - Output directory: `dist`
3. Deploy.

Or with the CLI:

```bash
npm i -g vercel
vercel          # link + deploy to preview
vercel --prod   # promote to production
```

The chess engine runs as a Web Worker (`public/engine/stockfish-19-lite-single.*`); Vercel serves these as static assets. The `vercel.json` ensures `.wasm` is served with the right MIME type.

## How it works

```
PGN ──► chess.js ──► positions ──► Stockfish 19 (WASM worker) ──► classification
                                                                      │
                                              commentary text ◄───────┘
                                                      │
                                            Web Speech API (voice)
```

| File | Role |
| --- | --- |
| `src/lib/pgn.ts` | Parses the PGN into plies with the FEN before and after every move. |
| `src/lib/engine.ts` | Promise-based UCI client driving Stockfish in a Web Worker. |
| `src/lib/uci.ts` | Parses `info`/`bestmove` lines, including mate scores. |
| `src/lib/analysis.ts` | Win probability, move labels, accuracy, coach prose. |
| `src/lib/coach.ts` | Speech synthesis wrapper (voices, rate, cancel). |
| `src/components/` | Board with arrow overlay, eval bar, move list, report. |
| `scripts/copy-engine.mjs` | Copies the engine out of `node_modules` on install. |

Every position is searched once at a fixed depth. A move's score is the
difference between the evaluation before it and the evaluation after it, so the
number of searches is one more than the number of plies. Results stream into the
UI as each search finishes.

### Move labels

Centipawns are converted to a 0–1 expected score, then the drop in expected
score decides the label:

| Label | Expected-score drop |
| --- | --- |
| Best | played the engine's top move |
| Excellent | < 2% |
| Good | 2–5% |
| Inaccuracy | 5–10% |
| Mistake | 10–20% |
| Blunder | ≥ 20% |
| Miss | a forced mate existed and was not played |

Accuracy is the average of per-move accuracy
(`103.1668·e^(−0.04354·loss%) − 3.1669`), the familiar published curve applied
to expected-score loss rather than raw centipawns — feeding it centipawns
produces absurd single-digit scores. These thresholds are approximations:
chess.com's own model is proprietary and will not match exactly.

## Voice

Uses the browser's built-in `speechSynthesis`, so voices depend on the operating
system and no audio is generated server-side.

- **Play through** walks the whole game hands-free: the board advances one move at
  a time, the coach speaks that move's commentary, and the next move begins when
  the line ends. Space is not needed — the button toggles to **Pause**, which cuts
  speech immediately; pressing it again resumes from where you stopped, and if you
  paused on the last move it starts over. Clicking a move, using ←/→, or the
  jump buttons takes over from playback and pauses it.
- **Speed** controls the voice rate *and* the pause between moves, so slowing it
  down gives the coach a more measured cadence.
- **Narrate as I step** speaks a move when you step to it by hand. It is suspended
  while playback is running so the two never talk over each other.
- **Read this move** speaks just the current line.

If a move's analysis is still streaming when playback reaches it, playback waits
for that result (up to six seconds) rather than skipping it. In browsers without
speech synthesis, Play through still works as a timed slideshow of the moves.
Speech starts only after a user gesture in most browsers, which the Play button
provides; iOS requires a tap before the first utterance.

## Limits worth knowing

- The bundled engine is Stockfish 19 **lite, single-threaded** (~1.8 MB): far
  stronger than any human, but weaker than the full 94 MB build. It needs no
  cross-origin isolation, which is why it works on Vercel static hosting.
- Analysis runs entirely in the browser via a Web Worker; nothing is sent to a
  server, so no API keys are required for engine analysis.
- The engine's `.wasm` and `.js` are copied from the `stockfish` npm package into
  `public/engine` at install time (git-ignored); Vercel serves them as static
  assets.

### Hosting notes

Vercel: static hosting of the React SPA served from `dist/`. The chess engine runs
as a Web Worker in the browser via `new Worker('engine/stockfish-19-lite-single.js')`.
With `vite.config.ts` set to `base: '/'`, `import.meta.url`-based resolution points to
the correct asset path in `dist/engine/`. Ensure `.wasm` is served with
`application/wasm` MIME type (handled by `vercel.json`).
- Depth 14 analyses a 34-ply game in a few seconds; deeper settings improve
  accuracy on quiet positional moves most.
- No opening-book detection, and no Brilliant/Great labels — both need extra
  heuristics beyond evaluation deltas.
- Analysis is single-pass per position, so "missed wins" are detected from the
  best move of the previous position rather than a full tactic search.

## Licensing

Stockfish is GPL-3.0. It is copied unmodified from the `stockfish` npm package
into `public/engine` at install time (git-ignored), and this repository's source
is available alongside it. Keep that in mind before shipping a closed-source
build that bundles the engine — running it server-side behind an API is the
usual way to keep it separate.
