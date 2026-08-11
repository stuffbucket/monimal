#!/usr/bin/env node
/**
 * Check the tarball that `npm publish` would upload to GitHub Packages.
 *
 * Everything here is answerable before a version exists in the registry. The
 * registry equivalent of #96's git-ref check — install the published version
 * and resolve every export — is not, so it is not in this file. See
 * `docs/consuming.md`.
 *
 * Two things it asserts that nothing else does. The publish identity: GitHub
 * Packages accepts a scoped name whose namespace is the account owning the
 * repository, and links the package by `repository.url`, so a wrong scope is a
 * 403 on a path that runs once per tag. And the contents of the real archive
 * rather than a listing: `v0.0.2` shipped with no `dist/` at all, and every
 * check that read a file list instead of the bytes was green.
 *
 *   node scripts/verify-publish.mjs                       # pack, then check
 *   node scripts/verify-publish.mjs dist-release          # check what is there
 *   node scripts/verify-publish.mjs dist-release --version v0.0.4
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportTargets, packedTarballName, targetPresent } from './export-checks.mjs';

const REGISTRY = 'https://npm.pkg.github.com';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

const argv = process.argv.slice(2);
const versionIndex = argv.indexOf('--version');
// -1 rather than 0 when the flag is absent, so it excludes no real argument.
const versionValue = versionIndex === -1 ? -1 : versionIndex + 1;
const wanted = versionIndex === -1 ? undefined : (argv[versionValue] ?? '').replace(/^v/, '');
const given = argv.find((value, index) => !value.startsWith('--') && index !== versionValue);

const scratch = await mkdtemp(path.join(tmpdir(), 'stuffbucket-publish-'));

async function run() {
  /* ------------------------------------------------------ publish identity */

  console.log('Publish identity');
  const repositoryUrl = manifest.repository?.url ?? '';
  const owner = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repositoryUrl);
  check(owner !== null, `repository.url names a GitHub repository (${repositoryUrl || 'unset'})`);

  const scope = /^@([^/]+)\//.exec(manifest.name ?? '')?.[1];
  check(
    scope !== undefined,
    `the package name is scoped, which GitHub Packages requires (${String(manifest.name)})`,
  );
  check(
    scope !== undefined && owner !== null && scope === owner[1],
    `the scope @${String(scope)} is the account that owns the repository`,
  );
  check(
    manifest.publishConfig?.registry === REGISTRY,
    `publishConfig.registry is ${REGISTRY}`,
  );

  /* -------------------------------------------------------------- the file */

  let directory = given;
  if (directory === undefined) {
    directory = path.join(scratch, 'pack');
    // `npm pack` does not create the destination, and fails with ENOENT.
    mkdirSync(directory, { recursive: true });
    execFileSync('npm', ['pack', '--pack-destination', directory], {
      cwd: root,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  }

  console.log(`\nTarball in ${directory}`);
  const tarballs = existsSync(directory)
    ? readdirSync(directory).filter((entry) => entry.endsWith('.tgz'))
    : [];

  /*
   * The floor. Everything below reads one archive, so an empty directory
   * would otherwise skip every assertion and exit zero on nothing at all.
   */
  check(tarballs.length === 1, `exactly one tarball is present (found ${String(tarballs.length)})`);
  if (tarballs.length !== 1) return;

  const tarball = tarballs[0];
  const expectedName = packedTarballName(manifest.name, manifest.version);
  check(tarball === expectedName, `the tarball is named ${expectedName}`);

  const unpacked = path.join(scratch, 'unpacked');
  mkdirSync(unpacked, { recursive: true });
  execFileSync('tar', ['-xzf', path.join(directory, tarball), '-C', unpacked], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const packageRoot = path.join(unpacked, 'package');
  check(existsSync(packageRoot), 'the archive holds a package/ directory');
  if (!existsSync(packageRoot)) return;

  const packed = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  check(packed.name === manifest.name, `the packed manifest names ${String(manifest.name)}`);
  check(
    packed.publishConfig?.registry === REGISTRY,
    'the packed manifest carries the registry, so a publish from the tarball reaches it',
  );
  if (wanted !== undefined) {
    check(packed.version === wanted, `the packed version is ${wanted}`);
  }

  /* ------------------------------------------------------- what is inside */

  const targets = exportTargets(packed.exports);
  console.log(`\nExport targets inside the tarball (${String(targets.length)})`);

  /*
   * The floor. A published package with no `exports` map resolves nothing for
   * a consumer, and a loop over an empty list reports a clean run.
   */
  check(targets.length > 0, 'the packed manifest declares at least one export');

  let present = 0;
  for (const { subpath, condition, target } of targets) {
    const ok = targetPresent(packageRoot, target);
    if (ok) present += 1;
    check(ok, `${subpath} ${condition} -> ${target} exists and is not empty`);
  }
  // The second floor, on the loop's result rather than its input. Issue #83:
  // a tarball with an `exports` map and no `dist/` is the shape `v0.0.2` had.
  check(present > 0, 'at least one export target is a file with bytes in it');

  const entries = readdirSync(packageRoot, { recursive: true, encoding: 'utf8' }).filter((entry) =>
    statSync(path.join(packageRoot, entry)).isFile(),
  );
  console.log(`\n${String(entries.length)} files in the archive`);
  check(entries.length > targets.length, 'the archive holds more than the export targets alone');
}

try {
  await run();
} finally {
  await rm(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} publish check(s) failed.`);
  process.exit(1);
}

console.log(`\n${manifest.name}@${manifest.version} is ready to publish to ${REGISTRY}.`);
