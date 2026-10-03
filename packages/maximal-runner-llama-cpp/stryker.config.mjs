const mutate = [
  'scripts/llama-package-checks.mjs',
  'scripts/llama-packaging.mjs',
  'src/host/llama-protocol.ts',
  'src/worker/grammar.ts',
]

if (mutate.length === 0) throw new Error('llama.cpp mutation scope is empty.')

export default {
  packageManager: 'pnpm',
  // Vitest 5 changed nested test-name separators; vitest-runner 10.0.0
  // consequently selects zero tests for covered mutants.
  testRunner: 'command',
  commandRunner: {
    command:
      'pnpm exec vitest run tests/grammar.test.ts tests/llama-protocol.test.ts tests/packaging.test.ts',
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
