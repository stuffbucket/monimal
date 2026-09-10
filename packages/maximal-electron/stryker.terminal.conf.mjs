import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const config = JSON.parse(readFileSync(new URL('./stryker.conf.json', import.meta.url), 'utf8'));
const mutate = config.mutate.filter((file) => /(?:terminal|pty|tmux|command-connectors)/.test(file));

if (mutate.length === 0) throw new Error('Terminal mutation scope is empty.');

export default {
  ...config,
  ignoreStatic: true,
  mutate,
  testFiles: ['tests/terminal/**/*.test.{ts,tsx}'],
  htmlReporter: { fileName: 'reports/mutation-terminal/dynamic.html' },
  jsonReporter: { fileName: 'reports/mutation-terminal/dynamic.json' },
};