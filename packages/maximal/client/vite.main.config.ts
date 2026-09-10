import { defineConfig } from 'vite'

// Main process bundle. Keep Electron + node builtins external.
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/, 'electron', 'node-llama-cpp', 'node-pty'],
      output: { entryFileNames: 'main.js' },
    },
  },
})
