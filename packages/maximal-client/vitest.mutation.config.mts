import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: [
      'src/renderer/terminal-tab-organization.test.ts',
      'src/renderer/settings/Settings.test.tsx',
    ],
  },
})
