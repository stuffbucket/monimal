import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'test/policy.test.mjs',
      'test/pulse-browser.test.mjs',
      'test/storybook-check.test.mjs',
    ],
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'reports/coverage',
    },
  },
});
