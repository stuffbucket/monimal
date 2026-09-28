/**
 * The second mutation phase: every static mutant from the dynamic report,
 * rerun in a fresh process.
 *
 * `ignoreStatic` leaves static mutants out of the per-test phase because a
 * module-level mutant is evaluated once per process. This phase reads the
 * dynamic report and reruns exactly those ranges with a command runner, so
 * each is judged by a process that loaded the mutated module.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const quote = (value) => process.platform === 'win32'
  ? `"${value.replaceAll('"', '""')}"`
  : `'${value.replaceAll("'", "'\\''")}'`;

export function staticTestFiles(report) {
  const covered = new Set();
  for (const entry of Object.values(report.files ?? {})) {
    for (const mutant of entry.mutants ?? []) {
      if (mutant.static !== true) continue;
      const coveredBy = mutant.coveredBy ?? [];
      if (coveredBy.length === 0) return [];
      for (const testId of coveredBy) covered.add(testId);
    }
  }
  return Object.entries(report.testFiles ?? {})
    .filter(([, entry]) => (entry.tests ?? []).some((test) => covered.has(test.id)))
    .map(([file]) => file)
    .sort();
}

/**
 * @param {URL | string} configUrl the package's own static config, for resolving paths and vitest
 * @param {Record<string, unknown>} config the package's dynamic Stryker config
 * @param {{ vitestArguments?: readonly string[], reportDirectory?: string }} [options]
 */
export function staticStrykerConfig(configUrl, config, { vitestArguments = [], reportDirectory = 'reports/mutation' } = {}) {
  // Knip loads Stryker configs to find plugins; it needs no dynamic report.
  const isArchitectureAnalysis =
    process.env.MONIMAL_ARCHITECTURE_ANALYSIS === '1' &&
    process.argv[1]?.endsWith('knip-bun.js') === true;
  if (isArchitectureAnalysis) return config;

  const root = dirname(fileURLToPath(configUrl));
  reportDirectory = process.env.MONIMAL_MUTATION_REPORT_DIRECTORY ?? reportDirectory;
  const require = createRequire(configUrl);
  const vitestManifestPath = require.resolve('vitest/package.json');
  const vitestManifest = JSON.parse(readFileSync(vitestManifestPath, 'utf8'));
  const vitestCommand = `${quote(process.execPath)} ${quote(resolve(dirname(vitestManifestPath), vitestManifest.bin.vitest))}`;

  const reportFile = resolve(root, reportDirectory, 'mutation.json');
  if (!existsSync(reportFile)) throw new Error('Run the dynamic mutation phase first.');
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));

  const ranges = new Set();
  for (const [file, entry] of Object.entries(report.files ?? {})) {
    for (const mutant of entry.mutants ?? []) {
      if (mutant.static !== true) continue;
      const { start, end } = mutant.location;
      ranges.add(
        `${file}:${start.line}:${Math.max(0, start.column - 1)}-${end.line}:${end.column + 1}`,
      );
    }
  }

  if (ranges.size === 0) throw new Error('Static mutation scope is empty.');
  const testFiles = staticTestFiles(report);

  return {
    ...config,
    commandRunner: {
      command: [
        vitestCommand,
        'run',
        ...testFiles.map(quote),
        ...vitestArguments,
      ].join(' '),
    },
    coverageAnalysis: 'off',
    ignoreStatic: false,
    mutate: [...ranges],
    tempDirName: process.env.MONIMAL_MUTATION_TEMP_DIR ?? config.tempDirName,
    testRunner: 'command',
    htmlReporter: { fileName: `${reportDirectory}/static.html` },
    jsonReporter: { fileName: `${reportDirectory}/static.json` },
  };
}
