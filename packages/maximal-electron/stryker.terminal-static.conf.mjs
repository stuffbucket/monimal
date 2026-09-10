import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import config from './stryker.terminal.conf.mjs';

const require = createRequire(import.meta.url);
const vitestManifestPath = require.resolve('vitest/package.json');
const vitestManifest = JSON.parse(readFileSync(vitestManifestPath, 'utf8'));
const quote = (value) => process.platform === 'win32'
  ? `"${value.replaceAll('"', '""')}"`
  : `'${value.replaceAll("'", "'\\''")}'`;
const vitestCommand = `${quote(process.execPath)} ${quote(resolve(dirname(vitestManifestPath), vitestManifest.bin.vitest))}`;

function staticConfig() {
  const reportFile = new URL('./reports/mutation-terminal/dynamic.json', import.meta.url);
  if (!existsSync(reportFile)) throw new Error('Run the terminal dynamic mutation phase first.');
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

  if (ranges.size === 0) throw new Error('Terminal static mutation scope is empty.');

  return {
    ...config,
    commandRunner: {
      command: `${vitestCommand} run tests/terminal`,
    },
    coverageAnalysis: 'off',
    ignoreStatic: false,
    mutate: [...ranges],
    testFiles: [],
    testRunner: 'command',
    htmlReporter: { fileName: 'reports/mutation-terminal/static.html' },
    jsonReporter: { fileName: 'reports/mutation-terminal/static.json' },
  };
}

const isArchitectureAnalysis =
  process.env.MONIMAL_ARCHITECTURE_ANALYSIS === '1' &&
  process.argv[1]?.endsWith('knip-bun.js') === true;

export default isArchitectureAnalysis ? config : staticConfig();