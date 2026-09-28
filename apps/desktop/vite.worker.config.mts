import {
  LLAMA_EXTERNAL_MODULES,
  LLAMA_WORKER_FILENAME,
} from '@maximal/maximal-llama-cpp/packaging'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/, 'electron', ...LLAMA_EXTERNAL_MODULES],
      // The entry imports the provider worker for process bootstrap side effects.
      treeshake: false,
      output: { entryFileNames: LLAMA_WORKER_FILENAME },
    },
  },
})
