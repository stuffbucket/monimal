import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { TERMINAL_LAB_RENDERER_CACHE } from './vite.cache-paths.mjs';

const root = resolve(import.meta.dirname, 'src/terminal-lab');

export default defineConfig({
  root,
  cacheDir: TERMINAL_LAB_RENDERER_CACHE,
  plugins: [react()],
  resolve: { preserveSymlinks: false },
  build: {
    outDir: resolve(import.meta.dirname, '.vite/renderer/terminal_lab_window'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { index: resolve(root, 'index.html') },
    },
  },
});