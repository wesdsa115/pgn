// Copies the Stockfish lite single-threaded engine into public/engine so it can
// be loaded as a plain Web Worker (no cross-origin isolation required).
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/stockfish/bin')
const target = resolve(root, 'public/engine')

const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']

await mkdir(target, { recursive: true })

for (const file of files) {
  try {
    await copyFile(resolve(source, file), resolve(target, file))
  } catch (error) {
    console.error(`[engine] could not copy ${file}: ${error.message}`)
    process.exitCode = 1
  }
}

console.log(`[engine] copied ${files.length} files to public/engine`)
