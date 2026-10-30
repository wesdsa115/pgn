import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    // The chess engine is a browser Web Worker loaded from public/engine/.
    // Vite rewrites asset URLs in the worker script depending on `base`, so
    // keep `ENGINE_URL` expressed as a runtime path that matches `base`.
  },
})
