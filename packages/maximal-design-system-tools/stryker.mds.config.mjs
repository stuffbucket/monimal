const mutate = [
  'src/policy.mjs:75-126',
  'src/storybook-browser-audit.mjs:40-65',
]

if (mutate.length === 0) throw new Error('Design-system mutation scope is empty.')

export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate,
  reporters: ['progress', 'clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mds-mutation.json' },
  tempDirName: '.stryker-mds-tmp',
  cleanTempDir: 'always',
  concurrency: 4,
  timeoutMS: 30_000,
  coverageAnalysis: 'off',
  ignoreStatic: false,
  thresholds: { high: 100, low: 100, break: 100 },
  ignorePatterns: ['node_modules', 'dist', 'reports'],
}
