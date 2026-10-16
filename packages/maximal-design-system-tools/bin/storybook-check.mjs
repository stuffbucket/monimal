#!/usr/bin/env node

import { main } from '../src/storybook-check.mjs';

await main(process.argv.slice(2));
