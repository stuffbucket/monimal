import react from "@vitejs/plugin-react"
import { resolve } from "node:path"
import { defineConfig } from "vite"

// The context-window lab: a real Vite dev server that renders this package's
// production ContextWindowSessionPanel against realistic fixture traffic, for
// `pnpm dev:context`. Root is the lab/ directory so index.html resolves.
export default defineConfig({
  root: resolve(import.meta.dirname),
  server: { open: true },
  plugins: [react()],
  resolve: {
    dedupe: ["@stuffbucket/maximal-electron", "react", "react-dom"],
  },
  build: {
    outDir: resolve(import.meta.dirname, "../.vite/lab"),
    emptyOutDir: true,
  },
})
