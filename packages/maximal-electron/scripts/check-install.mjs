#!/usr/bin/env node
/**
 * Refuse an install that carries no build.
 *
 * npm runs `prepack` for a packed tarball and `prepare` for a git dependency.
 * It runs neither for an `https://` source archive, so a
 * `codeload.github.com/.../tar.gz/<sha>` dependency installs this repository's
 * source with no `dist/` and exits 0, and the consumer finds out at their own
 * compile step. npm does run `postinstall` for every install form, so this is
 * the one place that failure can be made loud. Issue #100.
 *
 * Transitional. It costs every consumer a `postinstall` forever, and a registry
 * install cannot reach the state it catches. Remove it once
 * `stuffbucket/maximal` consumes this package from the GitHub Packages
 * registry. Issue #117 holds the condition and what removal touches.
 *
 * It runs on this repository too, where `dist/` is absent until `prepare`
 * builds it — `postinstall` runs first — hence the `node_modules` test.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { INSTALLED_WITHOUT_BUILD, declaredTargets, missingTargets, packedTarballName } from './export-checks.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const installedAsDependency = root.split(path.sep).includes('node_modules');
if (!installedAsDependency) process.exit(0);

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const declared = declaredTargets(manifest.exports);
const missing = missingTargets(root, manifest.exports);

/*
 * The floor. A manifest with no `exports` map leaves nothing to be missing, and
 * an empty list would otherwise read as a clean install.
 */
if (declared.length === 0) {
  console.error(`${manifest.name}: the manifest names no export targets, so nothing here is checkable.`);
  process.exit(1);
}

if (missing.length === 0) process.exit(0);

const home = String(manifest.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');

// npm's own name for a scoped tarball. Interpolating `manifest.name` gives
// `@scope/name-<version>.tgz`, and that URL is a 404.
const asset = packedTarballName(manifest.name, '<version>');

console.error(`
${manifest.name}@${manifest.version}: ${INSTALLED_WITHOUT_BUILD}.

  ${String(missing.length)} of the ${String(declared.length)} files this package's exports name are not here:
${missing.map((target) => `    ${target}`).join('\n')}

  npm runs \`prepack\` for a packed tarball and \`prepare\` for a git
  dependency. It runs neither for an \`https://\` source archive, so a
  codeload.github.com URL installs source that was never built. This package is
  not on the public npm registry. Use one of:

    ${manifest.name}@<range>, from ${manifest.publishConfig?.registry ?? 'the registry'}
    github:${home.replace(/^https:\/\/github\.com\//, '')}#<ref>
    ${home}/releases/download/v<version>/${asset}

  See docs/consuming.md in this package's repository.
`);
process.exit(1);
