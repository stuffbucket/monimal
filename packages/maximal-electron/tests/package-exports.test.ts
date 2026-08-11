import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { selectors, unscopedSelectors } from '../scripts/css-selectors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The class every rule in the package stylesheet has to sit under. */
const SHELL_ROOT = '.sb-shell';

interface PackageManifest {
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
  files: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
  devDependencies: Record<string, string>;
}

describe('package exports', () => {
  it('publishes the main seam, host, renderer JavaScript and types, and structural CSS', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.exports).toMatchObject({
      './main': {
        types: './dist/host/run-main.d.ts',
        default: './dist/host/run-main.js',
      },
      './host': {
        types: './dist/host/host-window.d.ts',
        default: './dist/host/host-window.js',
      },
      './renderer': {
        types: './dist/renderer/index.d.ts',
        default: './dist/renderer/index.js',
      },
      './renderer/styles.css': './dist/renderer/styles.css',
      './verify': {
        types: './scripts/terminal-package.d.mts',
        default: './scripts/terminal-package.mjs',
      },
    });
    expect(manifest.files).toContain('dist');
    expect(manifest.files).toContain('scripts/terminal-package.mjs');
    expect(manifest.scripts['build:package']).toBeTruthy();
    expect(manifest.scripts['verify:exports']).toBeTruthy();
  });

  /*
   * A caret on a version this repository ships is a version nobody chose.
   * `^1.2.0-beta.14` admitted every later beta and every 1.x release from a
   * prerelease line. Issue #79.
   *
   * These moved to `devDependencies` when issue #31 took them off a consumer's
   * install path, and a packaged build still contains them, so the pin still
   * applies. `react` and `react-dom` are exempt because the consumer owns that
   * instance, which is the reason they are a peer.
   */
  it('pins every package a build ships to an exact version', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;
    const mainConfig = await readFile(path.join(ROOT, 'vite.main.config.ts'), 'utf8');

    // The externals arrive as real files rather than bundled, so they are
    // shipped whether or not an export imports them.
    const externals = [...(/external:\s*\[([^\]]*)]/.exec(mainConfig)?.[1] ?? '').matchAll(
      /'([^']+)'/g,
    )].map((match) => match[1] ?? '');
    expect(externals.length).toBeGreaterThan(0);

    const shipped = [
      ...new Set([...externals, ...Object.keys(manifest.peerDependencies)]),
    ].filter((name) => name !== 'react' && name !== 'react-dom');
    expect(shipped.length).toBeGreaterThan(0);

    const pins = shipped.map((name) => [name, manifest.devDependencies[name] ?? ''] as const);
    expect(
      pins.filter(([, range]) => !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(range)),
    ).toEqual([]);
  });

  /*
   * npm resolves dependencies per package, not per export, so a runtime
   * dependency reaches every consumer of every entry point. Issue #31.
   *
   * An optional peer is the only npm mechanism that installs nothing. An
   * `optionalDependencies` entry installs by default, and npm 7 and later
   * auto-installs a peer that is not marked optional.
   */
  it('leaves a consumer to install what the entry point they import needs', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();

    const peers = Object.keys(manifest.peerDependencies);
    expect(peers.length).toBeGreaterThan(0);
    expect(
      peers.filter((name) => manifest.peerDependenciesMeta[name]?.optional !== true),
    ).toEqual([]);

    /*
     * `react-dom` is a peer nothing in `dist/` imports, and it stays. A React
     * component does not import a renderer; the consumer mounting these
     * components needs one, and naming it here is how they learn which. Do not
     * delete it for being unreachable — the import graph is the wrong question
     * for this one.
     */
    for (const dependency of ['react', 'react-dom']) {
      expect(manifest.peerDependencies[dependency]).toBe('>=18.0.0 <20.0.0');
      expect(manifest.devDependencies[dependency]).toBe('^19.2.8');
    }
  });

  it('makes every injected titlebar region non-draggable', async () => {
    const stylesheet = await readFile(
      path.join(ROOT, 'src/renderer/styles/structural.css'),
      'utf8',
    );

    expect(stylesheet).toMatch(
      /\.sb-shell \.titlebar__leading,\s*\.sb-shell \.titlebar__actions\s*\{[^}]*-webkit-app-region:\s*no-drag;/s,
    );
  });

  /*
   * Every selector, not the ones a prefix heuristic recognises.
   *
   * This list used to be lines starting `.` or `*` and ending `,` or `{`. A
   * rule of any other shape was not in the list and so was never judged:
   * `button { color: red; }` appended here left the suite green and turned
   * every button in a consumer's application red. Issue #51.
   *
   * `scripts/verify-exports.mjs` runs the same parse over
   * `dist/renderer/styles.css`, which is the file a consumer installs, and
   * asserts the two agree. It runs after a build, so the artifact is there;
   * this reads the source, which needs none.
   */
  it('scopes every exported structural selector to the shell root', async () => {
    const stylesheet = await readFile(
      path.join(ROOT, 'src/renderer/styles/structural.css'),
      'utf8',
    );
    const parsed = selectors(stylesheet);

    // The floor. A parser that returned nothing would report a clean
    // stylesheet over no selectors at all.
    expect(parsed.length).toBeGreaterThan(30);
    expect(unscopedSelectors(stylesheet, SHELL_ROOT)).toEqual([]);
    expect(stylesheet).toContain('.sb-shell.app {');
  });
});
