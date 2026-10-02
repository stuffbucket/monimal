import { LLAMA_EXTERNAL_MODULES } from '@maximal/maximal-llama-cpp/packaging'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/, 'electron', ...LLAMA_EXTERNAL_MODULES],
      output: {
        entryFileNames: 'assistant-cli.cjs',
        chunkFileNames: 'assistant-cli-[name]-[hash].cjs',
        format: 'cjs',
      },
    },
  },
})
