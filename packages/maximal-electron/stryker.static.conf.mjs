import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { staticStrykerConfig } from '../../scripts/stryker-static.mjs';

const config = JSON.parse(readFileSync(new URL('./stryker.conf.json', import.meta.url), 'utf8'));

export default staticStrykerConfig(import.meta.url, config, {
  // These tests import only helpers under ignored `e2e/`, which is absent
  // from the command-runner sandbox and outside this mutation scope.
  vitestArguments: [
    '--exclude tests/screenshot.test.ts',
    '--exclude tests/shuffle.test.ts',
  ],
});
