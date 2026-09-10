import { defineConfig } from 'vite';

// Main process.
//
// `entryFileNames` is explicit because the entry is `src/main/index.ts`. Left
// to Rollup's default the output would be `index.js`, which collides with the
// preload bundle in the same directory. `package.json#main` points at
// `.vite/build/main.js`.
//
// `node-pty` is a native module. Bundling it would inline JavaScript that
// resolves a `.node` binary by relative path, and that path does not survive
// the move into `.vite/build`. It stays external and is loaded from
// `node_modules` at run time, which is also why `forge.config.ts` unpacks it
// from the asar.
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron', 'node-pty'],
      output: { entryFileNames: 'main.js' },
    },
  },
});
