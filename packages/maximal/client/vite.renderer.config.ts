import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Renderer. Root is src/renderer; outDir must be absolute when overriding root
// or Vite misdirects the output away from the package.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    // See scripts/apply-deviations.mjs — needed because maximal-electron is a
    // workspace link here, not a published install.
    dedupe: [
      'react',
      'react-dom',
      'react-resizable-panels',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-visually-hidden',
    ],
  },
  build: {
    outDir: resolve(import.meta.dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
})
