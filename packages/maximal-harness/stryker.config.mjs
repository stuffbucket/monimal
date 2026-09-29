const mutate = [
  'src/host/approval.ts',
  'src/host/provider-endpoint.ts',
  'src/renderer/overlay-keys.ts',
]

if (mutate.length === 0) throw new Error('Harness mutation scope is empty.')

export default {
  packageManager: 'pnpm',
  // Vitest 5 changed nested test-name separators; vitest-runner 10.0.0
  // consequently selects zero tests for covered mutants.
  testRunner: 'command',
  commandRunner: {
    command:
      'pnpm exec vitest run tests/approval.test.ts tests/overlay-keys.test.ts tests/provider-endpoint.test.ts',
  },
  mutate,
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
