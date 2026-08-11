import { defineConfig } from 'vite';

// Preload runs in a sandboxed context, so it must emit CommonJS: a sandboxed
// preload does not support ES modules.
//
// `entryFileNames` is explicit for the same reason as the main config; the
// entry is `src/preload/index.ts`, and `src/main/windows/main-window.ts`
// resolves this bundle as `preload.js`.
export default defineConfig({
  build: {
    sourcemap: 'inline',
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs', entryFileNames: 'preload.js' },
    },
  },
});
