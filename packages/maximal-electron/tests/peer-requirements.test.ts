import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  REQUIRED_WITHOUT_IMPORT,
  failedPeerChecks,
  missingPeerChecks,
  peerRequirements,
  readPackageSource,
} from '../scripts/peer-requirements.mjs';

/**
 * The check a `./renderer` consumer runs, over a fixture package.
 *
 * `scripts/verify-exports.mjs` runs the same functions over this repository's
 * own build. Running them here over a tree this file writes means a walk that
 * stops following relative imports fails on a known graph rather than on
 * whatever `dist/` happens to hold. Issue #172.
 */

let root: string;

const EXPORTS = {
  './renderer': { types: './dist/renderer/index.d.ts', default: './dist/renderer/index.js' },
  './host': { types: './dist/host/host-window.d.ts', default: './dist/host/host-window.js' },
  './verify': { types: './scripts/thing.d.mts', default: './scripts/thing.mjs' },
  './renderer/styles.css': './dist/renderer/styles.css',
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'peer-requirements-'));
  await mkdir(path.join(root, 'dist/renderer/components'), { recursive: true });
  await mkdir(path.join(root, 'dist/host'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });

  // The entry names no package itself, so a walk that stops here finds nothing
  // and the fixture proves the graph is followed. `Gone.js` is not written: a
  // walk of an install this file did not build has to survive a dead edge.
  // `yaml` sorts after everything the deeper module reaches, and is reached
  // first, so an unsorted return is a different array rather than the same one.
  await writeFile(
    path.join(root, 'dist/renderer/index.js'),
    "export { Canvas } from './components/Canvas.js';\n" +
      "import './components/Gone.js';\n" +
      "import 'yaml';\n",
  );

  // Imports are deliberately out of alphabetical order.
  await writeFile(
    path.join(root, 'dist/renderer/components/Canvas.js'),
    "import { Folder } from 'lucide-react';\n" +
      "import * as Tabs from '@radix-ui/react-tabs';\n" +
      "import { useState } from 'react';\n" +
      "import path from 'node:path';\n" +
      "export const Canvas = () => null;\n",
  );

  await writeFile(path.join(root, 'dist/host/host-window.js'), "import 'electron';\n");
  await writeFile(path.join(root, 'scripts/thing.mjs'), "import 'yaml';\n");
  await writeFile(path.join(root, 'dist/renderer/styles.css'), '.sb-shell {}\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('peerRequirements', () => {
  it('reaches packages the entry imports only through another module', async () => {
    const requirements = await peerRequirements(root, EXPORTS);

    expect(requirements.get('./renderer')).toContain('lucide-react');
    expect(requirements.get('./renderer')).toContain('@radix-ui/react-tabs');
    expect(requirements.get('./host')).toEqual(['electron']);
  });

  it('scopes a requirement to the entry point that reaches it', async () => {
    const requirements = await peerRequirements(root, EXPORTS);

    // The whole point of the table: a host consumer installs none of these.
    expect(requirements.get('./host')).not.toContain('lucide-react');
  });

  it('leaves node: builtins and relative imports out', async () => {
    const requirements = await peerRequirements(root, EXPORTS);
    const renderer = requirements.get('./renderer') ?? [];

    expect(renderer).not.toContain('node:path');
    expect(renderer.some((name) => name.startsWith('.'))).toBe(false);
  });

  it('adds a package the entry requires and no import names', async () => {
    const requirements = await peerRequirements(root, EXPORTS);

    // Nothing in the fixture imports react-dom, and a consumer still needs it.
    expect(requirements.get('./renderer')).toContain('react-dom');
    expect(REQUIRED_WITHOUT_IMPORT).toEqual([{ subpath: './renderer', name: 'react-dom' }]);
  });

  it('walks no asset target', async () => {
    const requirements = await peerRequirements(root, EXPORTS);

    expect(requirements.has('./renderer/styles.css')).toBe(false);
  });

  it('walks an .mjs target as well as a .js one', async () => {
    const requirements = await peerRequirements(root, EXPORTS);

    expect(requirements.get('./verify')).toEqual(['yaml']);
  });

  it('returns the names sorted, whatever order the graph reached them in', async () => {
    const requirements = await peerRequirements(root, EXPORTS);

    // `yaml` is reached first and sorts last.
    expect(requirements.get('./renderer')).toEqual([
      '@radix-ui/react-tabs',
      'lucide-react',
      'react',
      'react-dom',
      'yaml',
    ]);
  });

  /*
   * A diamond, read through a counting reader: `index` imports `left` and
   * `right`, and both import `shared`.
   *
   * The assertion is the read count, not the elapsed time. A walk that does not
   * remember where it has been reads `shared` twice here and never returns on a
   * graph that imports itself in a circle, and only the first of those is
   * something a test can state.
   */
  it('reads a module once however many modules import it', async () => {
    const sources = new Map([
      ['/pkg/d/index.js', "import './left.js';\nimport './right.js';\n"],
      ['/pkg/d/left.js', "import './shared.js';\n"],
      ['/pkg/d/right.js', "import './shared.js';\n"],
      ['/pkg/d/shared.js', "import 'lucide-react';\n"],
    ]);
    const reads: string[] = [];

    const requirements = await peerRequirements(
      '/pkg',
      { './renderer': { default: './d/index.js' } },
      (file: string) => {
        reads.push(file);
        return Promise.resolve(sources.get(file) ?? '');
      },
    );

    expect(requirements.get('./renderer')).toEqual(['lucide-react', 'react-dom']);
    expect(reads.filter((file) => file === '/pkg/d/shared.js')).toHaveLength(1);
    expect(reads).toHaveLength(4);
  });

  it('reports what it could read when a file the graph names is absent', async () => {
    // `index.js` imports `./components/Gone.js`, which was never written.
    const requirements = await peerRequirements(root, EXPORTS);

    expect(requirements.get('./renderer')).toContain('lucide-react');
  });
});

describe('readPackageSource', () => {
  it('reads a module this install carries', async () => {
    expect(await readPackageSource(path.join(root, 'dist/host/host-window.js'))).toContain(
      'electron',
    );
  });

  it('reads nothing at all for a module it does not', async () => {
    // Empty, not a message and not a throw: the walk adds whatever comes back
    // to the import scan, and only nothing can contribute nothing.
    expect(await readPackageSource(path.join(root, 'dist/renderer/components/Gone.js'))).toBe('');
  });
});

describe('missingPeerChecks', () => {
  const requirements = new Map([
    ['./renderer', ['lucide-react', 'react']],
    ['./host', ['electron']],
  ]);

  it('fails the package a consumer did not install and passes the rest', () => {
    const installed = new Set(['react']);
    const checks = missingPeerChecks({
      requirements,
      subpaths: ['./renderer'],
      resolve: (name) => installed.has(name),
    });

    expect(failedPeerChecks(checks)).toEqual([
      'lucide-react is required by ./renderer and does not resolve',
    ]);
  });

  it('says nothing about an entry point the caller does not use', () => {
    const checks = missingPeerChecks({
      requirements,
      subpaths: ['./renderer'],
      resolve: () => true,
    });

    expect(checks.some((check) => check.name.includes('./host'))).toBe(false);
    expect(failedPeerChecks(checks)).toEqual([]);
  });

  it('fails a subpath the manifest does not export', () => {
    const checks = missingPeerChecks({
      requirements,
      subpaths: ['./renderr'],
      resolve: () => true,
    });

    expect(checks.map((check) => check.name)).toContain('./renderr is an export of this package');
    expect(failedPeerChecks(checks)).toContain(
      'the manifest names no module target for ./renderr',
    );

    /*
     * And the floor fails with it. This is the case that separates "checked
     * nothing" from "checked everything and found nothing wrong": the checks
     * are not empty, and none of them asked about a package.
     */
    expect(failedPeerChecks(checks)).toContain(
      'no named subpath required any package, so nothing was checked',
    );
  });

  it('names each check after the entry point and the package it asked about', () => {
    const checks = missingPeerChecks({
      requirements,
      subpaths: ['./host'],
      resolve: () => true,
    });

    expect(checks.map((check) => check.name)).toEqual([
      './host can resolve electron',
      'the requirements reached at least one package',
    ]);
  });

  /*
   * The floor. Both of these ask nothing, and a report of zero failures over
   * zero questions is the shape that reads as a pass.
   */
  it('fails when it checked no package at all', () => {
    expect(
      failedPeerChecks(missingPeerChecks({ requirements, subpaths: [], resolve: () => true })),
    ).toContain('no named subpath required any package, so nothing was checked');

    expect(
      failedPeerChecks(
        missingPeerChecks({
          requirements: new Map([['./verify', []]]),
          subpaths: ['./verify'],
          resolve: () => true,
        }),
      ),
    ).toContain('no named subpath required any package, so nothing was checked');
  });
});
