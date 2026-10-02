import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: [
      'src/renderer/appearance.test.ts',
      'src/renderer/material-preference.test.ts',
      'src/renderer/theme-application.test.ts',
      'src/renderer/theme-history.test.ts',
      'src/renderer/settings/GeneralSection.test.tsx',
    ],
  },
})
