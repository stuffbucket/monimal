import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { staticStrykerConfig } from '../../scripts/stryker-static.mjs';

const config = JSON.parse(readFileSync(new URL('./stryker.conf.json', import.meta.url), 'utf8'));

export default staticStrykerConfig(import.meta.url, config);
