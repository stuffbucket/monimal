import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { reactClickToComponent } from 'vite-plugin-react-click-to-component'

// Renderer. Root is src/renderer; outDir must be absolute when overriding root
// or Vite misdirects the output away from the package.
export default defineConfig(({ command }) => ({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [
    react(),
    ...(command === 'serve' ? [reactClickToComponent()] : []),
  ],
  resolve: {
    // Forge's renderer base sets `preserveSymlinks: true`. Under pnpm that keys
    // each module by the link it was reached through, so a workspace package
    // reached through two others (maximal-terminal via maximal-client and
    // maximal-electron) loads twice, with its dependencies.
    preserveSymlinks: false,
    dedupe: [
      '@maximal/maximal-electron',
      '@maximal/maximal-harness',
      '@maximal/maximal-observability',
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
  // This workspace-linked entrypoint changes with maximal-electron's public
  // renderer surface. Prebundling would retain stale named exports between
  // local package builds.
  optimizeDeps: {
    exclude: ['@maximal/maximal-electron/renderer'],
  },
  build: {
    outDir: resolve(import.meta.dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'src/renderer/index.html'),
        overlay: resolve(import.meta.dirname, 'src/renderer/overlay.html'),
      },
    },
  },
}))