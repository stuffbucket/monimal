#!/usr/bin/env node

import { main } from '../src/api-surface.mjs';
import { main as policyMain } from '../src/policy.mjs';

const argv = process.argv.slice(2);
const apiMatches = await main(argv);
const policyMatches = argv.includes('--update') ? true : await policyMain(argv);
if (!apiMatches || !policyMatches) process.exitCode = 1;
