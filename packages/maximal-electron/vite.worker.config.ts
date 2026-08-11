import { defineConfig } from 'vite';

// The llama.cpp engine process.
//
// A third `main` target, built into the same `.vite/build` directory as the
// main bundle, because `native/llama-host.ts` forks it from `__dirname`.
// `entryFileNames` is explicit for the same reason `vite.main.config.ts` sets
// it: the entry is `src/main/llama-worker.ts` and Rollup's default name would
// not be the one the fork asks for.
//
// `node-llama-cpp` stays external. Its own documentation says the file
// structure is load-bearing and bundling breaks it, and it is ESM only while
// this bundle is CommonJS, so the worker reaches it through a hidden dynamic
// import. It is the only file in the repository that does.
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron', 'node-llama-cpp'],
      output: { entryFileNames: 'llama-worker.js' },
    },
  },
});
