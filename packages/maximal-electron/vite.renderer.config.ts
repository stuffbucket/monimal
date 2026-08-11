import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = resolve(__dirname, 'src/renderer');

// Renderer.
//
// Two HTML entry points: the application shell, and the splash window that the
// main process opens before the shell is ready.
//
// `root` points at `src/renderer` so both HTML files land flat in the output
// directory. Forge's default `outDir` is relative to the root it sets, so
// overriding `root` requires an absolute `outDir` as well; without it the
// build writes to `src/renderer/.vite/...` and never reaches the package.
// `src/main/windows/*.ts` resolve these files as
// `../renderer/<MAIN_WINDOW_VITE_NAME>/<name>.html`.
export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        splash: resolve(root, 'splash.html'),
        overlay: resolve(root, 'overlay.html'),
      },
    },
  },
});
