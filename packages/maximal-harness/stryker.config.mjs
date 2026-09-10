const mutate = [
  'scripts/llama-package-checks.mjs',
  'scripts/llama-packaging.mjs',
  'src/host/approval.ts',
  'src/host/llama-protocol.ts',
  'src/host/provider-endpoint.ts',
  'src/renderer/overlay-keys.ts',
  'src/worker/grammar.ts',
]

if (mutate.length === 0) throw new Error('Harness mutation scope is empty.')

export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate,
  testFiles: [
    'tests/approval.test.ts',
    'tests/grammar.test.ts',
    'tests/llama-protocol.test.ts',
    'tests/overlay-keys.test.ts',
    'tests/packaging.test.ts',
    'tests/provider-endpoint.test.ts',
  ],
  reporters: ['progress', 'clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  concurrency: 4,
  timeoutMS: 30_000,
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  ignorePatterns: ['node_modules', 'dist', 'reports'],
}
