import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/color/fixtures.ts',
      ],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'reports/coverage',
      thresholds: {
        branches: 51.9,
        functions: 63.5,
        lines: 62.6,
        statements: 60.6,
      },
    },
  },
})
