#!/usr/bin/env node
/**
 * Resolve every export subpath of an installed package, from beside the
 * `node_modules` that holds it.
 *
 * `import.meta.resolve` answers relative to the calling module's own URL, so
 * this file cannot ask the question from inside this repository: a copy is
 * written into the scratch directory and run there.
 * `scripts/verify-git-install.mjs` reads the JSON it prints on stdout, so
 * nothing else may be written there.
 */

import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const name = process.argv[2];
const manifest = JSON.parse(
  await readFile(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8'),
);

const resolved = Object.keys(manifest.exports ?? {}).map((subpath) => {
  const specifier = `${name}${subpath.slice(1)}`;
  try {
    return { subpath, specifier, url: import.meta.resolve(specifier), error: null };
  } catch (error) {
    return { subpath, specifier, url: null, error: error.message };
  }
});

/*
 * `./verify` is the one export that loads here. `./host` imports `electron`,
 * which a library consumer supplies, and `./renderer` imports React. Loading
 * either would report the scratch directory's dependencies rather than this
 * package's own packaging.
 */
let verify;
try {
  verify = { names: Object.keys(await import(`${name}/verify`)).sort(), error: null };
} catch (error) {
  verify = { names: [], error: error.message };
}

process.stdout.write(JSON.stringify({ exports: manifest.exports ?? {}, resolved, verify }));
