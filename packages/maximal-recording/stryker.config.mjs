export default {
  packageManager: 'pnpm',
  testRunner: 'command',
  commandRunner: {
    command: 'pnpm exec vitest run',
  },
  mutate: [
    'src/main.ts:23-29',
    'src/main.ts:96-105',
  ],
  reporters: ['progress', 'clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  concurrency: 4,
  timeoutMS: 30_000,
  coverageAnalysis: 'off',
  ignoreStatic: false,
  thresholds: { high: 100, low: 100, break: 100 },
  ignorePatterns: ['node_modules', 'dist', 'reports'],
}
