import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    sequence: {
      shuffle: { files: true, tests: true },
      ...(process.env['VITEST_SEED']
        ? { seed: Number(process.env['VITEST_SEED']) }
        : {}),
    },
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}', 'src/shared/**/*.test.ts'],
        },
      },
    ],
  },
})