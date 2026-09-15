import { LLAMA_WORKER_FILENAME } from '@stuffbucket/maximal-harness/packaging'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/, 'electron', 'node-llama-cpp'],
      // The entry imports the harness worker for process bootstrap side effects.
      treeshake: false,
      output: { entryFileNames: LLAMA_WORKER_FILENAME },
    },
  },
})
