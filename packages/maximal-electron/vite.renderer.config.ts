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

  /*
   * Resolve through symlinks, against Forge's default.
   *
   * `@electron-forge/plugin-vite` hardcodes `resolve.preserveSymlinks: true`
   * for renderers, and merges this config last, so this is the only place that
   * can override it.
   *
   * With it on and a pnpm install, `react` is reachable at two symlink paths
   * — `packages/maximal-electron/node_modules/react` and the workspace root's
   * — that point at one physical directory. Rolldown never calls `realpath`,
   * so it treats them as two modules and emits two complete copies of React
   * into the shared chunk. `react-dom/client` renders with the first and sets
   * only that copy's dispatcher; `@radix-ui/react-context` is hoisted to the
   * workspace root alone, imports the second, and calls `useMemo` on a null
   * dispatcher on its first render.
   *
   * The result was a window that rendered nothing at all: `#root` empty, one
   * `TypeError: Cannot read properties of null (reading 'useMemo')`, and five
   * end-to-end tests timing out on a title bar that never appeared. Storybook
   * was unaffected throughout, because it never goes through Forge's config
   * and therefore only ever saw one React.
   *
   * A bisect found no guilty commit: every commit back to the repository's
   * root fails the same way, and the same two commits pass with this line.
   * Nothing here changed — the install shape did.
   */
  resolve: { preserveSymlinks: false },
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
