import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { exclude: ['@maximal/maximal-electron/renderer'] },
})
