import { defineConfig, type UserConfig } from 'vite'

export function normalizePreloadOutput(config: UserConfig): void {
  const output = config.build?.rollupOptions?.output
  if (!output || Array.isArray(output)) return
  delete output.inlineDynamicImports
  output.codeSplitting = false
}

// Preload must be CommonJS (a sandboxed preload cannot use ESM).
export default defineConfig({
  build: {
    sourcemap: 'inline',
    rollupOptions: {
      external: [/^node:/, 'electron'],
      output: { entryFileNames: 'preload.js', format: 'cjs' },
    },
  },
  plugins: [{
    name: 'normalize-forge-preload-output',
    enforce: 'post',
    config: normalizePreloadOutput,
  }],
})