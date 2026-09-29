#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const child = spawn(
  'pnpm',
  ['exec', 'turbo', 'run', 'package', '--filter=@maximal/maximal-electron'],
  { cwd: root, stdio: 'inherit', env: process.env },
);
child.on('error', (error) => {
  console.error(`Could not build the reference application: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code) => {
  if (process.exitCode === undefined) process.exitCode = code ?? 1;
});
