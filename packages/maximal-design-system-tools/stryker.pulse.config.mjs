const mutate = [
  'src/pulse-event-matrix.ts:171-200',
  'src/pulse-event-matrix.ts:265-318',
  'src/react-state-analysis.ts:274-278',
  'src/react-state-analysis.ts:285-292',
  'src/react-state-analysis.ts:299-308',
  'src/react-state-analysis.ts:315-316',
  'src/react-state-analysis.ts:325-338',
  'src/react-state-analysis.ts:570-602',
  'src/state-machine-cross-products.ts:71-71',
  'src/state-machine-cross-products.ts:89-89',
]

export default {
  packageManager: 'pnpm',
  testRunner: 'command',
  commandRunner: {
    command: 'pnpm exec vitest run test/pulse-event-matrix.test.ts test/react-state-analysis.test.ts',
  },
  mutate,
  reporters: ['progress', 'clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation/pulse-mutation.json' },
  tempDirName: '.stryker-pulse-tmp',
  cleanTempDir: 'always',
  concurrency: 4,
  timeoutMS: 30_000,
  coverageAnalysis: 'off',
  ignoreStatic: false,
  thresholds: { high: 100, low: 100, break: 100 },
  ignorePatterns: ['node_modules', 'dist', 'reports'],
}
