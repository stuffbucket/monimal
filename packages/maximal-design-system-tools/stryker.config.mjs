const mutate = [
  'src/policy.mjs:75-126',
  'src/pulse-browser.mjs:199-205',
  'src/pulse-browser.mjs:209-210',
  'src/pulse-browser.mjs:244-246',
  'src/pulse-browser.mjs:248-250',
  'src/pulse-browser.mjs:268-268',
  'src/pulse-browser.mjs:297-301',
  'src/pulse-browser.mjs:307-307',
  'src/pulse-browser.mjs:315-322',
  'src/pulse-browser.mjs:336-344',
  'src/pulse-browser.mjs:503-517',
  'src/pulse-browser.mjs:805-817',
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
