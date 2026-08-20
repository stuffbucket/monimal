#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR;
const envFile = process.env.CLAUDE_ENV_FILE;

if (projectDir === undefined || projectDir === '') {
  throw new Error('CLAUDE_PROJECT_DIR is not set');
}
if (envFile === undefined || envFile === '') {
  throw new Error('CLAUDE_ENV_FILE is not set');
}

const npmrc = path.join(projectDir, '.npmrc');
const registries = readFileSync(npmrc, 'utf8')
  .split(/\r?\n/)
  .filter((line) => !/^\s*[#;]/.test(line))
  .map((line) => /^\s*registry\s*=\s*(\S+)\s*$/i.exec(line)?.[1])
  .filter((value) => value !== undefined);

if (registries.length !== 1) {
  throw new Error(`${npmrc} must contain exactly one registry= value`);
}

const registry = new URL(registries[0]);
if (
  registry.protocol !== 'https:' ||
  registry.username !== '' ||
  registry.password !== '' ||
  registry.search !== '' ||
  registry.hash !== ''
) {
  throw new Error(`${npmrc} registry must be an HTTPS URL without credentials, query, or fragment`);
}

const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
const value = registry.toString();
appendFileSync(
  envFile,
  ['NPM_CONFIG_REGISTRY', 'PNPM_CONFIG_REGISTRY', 'BUN_CONFIG_REGISTRY']
    .map((name) => `export ${name}=${quote(value)}`)
    .join('\n') + '\n',
);
