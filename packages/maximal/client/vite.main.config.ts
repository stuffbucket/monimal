import { defineConfig, type Plugin } from 'vite'

function restartElectronAfterMainBuild(): Plugin {
  let initialBuild = true
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  return {
    name: 'maximal:restart-electron-after-main-build',
    closeBundle() {
      if (initialBuild) {
        initialBuild = false
        return
      }
      // Forge 7.11 leaves its restart signal disabled behind electron/forge#3380.
      clearTimeout(restartTimer)
      restartTimer = setTimeout(() => process.stdin.emit('data', 'rs'), 100)
    },
  }
}

// Main process bundle. Keep Electron + node builtins external.
export default defineConfig({
  plugins: [restartElectronAfterMainBuild()],
  build: {
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/, 'electron', 'node-llama-cpp', 'node-pty'],
      output: { entryFileNames: 'main.js' },
    },
  },
})
