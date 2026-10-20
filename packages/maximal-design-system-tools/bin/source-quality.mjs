#!/usr/bin/env node

import { main } from '../src/source-quality.mjs';

await main(process.argv.slice(2));
