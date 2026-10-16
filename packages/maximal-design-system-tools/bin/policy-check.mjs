#!/usr/bin/env node

import { main } from '../src/policy.mjs';

if (!await main(process.argv.slice(2))) process.exitCode = 1;
