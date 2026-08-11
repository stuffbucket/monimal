import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { newestMtime } from './e2e/freshness.js';

const root = resolve(__dirname, 'e2e/fixtures/demo-shell');

/**
 * Refuse to build the fixture against a stale or missing `dist/`.
 *
 * The fixture imports `@stuffbucket/maximal-electron/renderer`, which the
 * `exports` map sends to `dist/`, which `npm run build:package` writes. The
 * `prepack`, `prepare`, `prestart` and `prepackage` hooks all run that build,
 * so every documented flow arrives here with a current `dist/`. Anything that
 * drives Forge directly does not, and a bundle compiled against yesterday's
 * exports is the failure `requireFreshBundles` exists to prevent one layer up:
 * a recording that looks right and shows the previous build.
 *
 * Missing is reported apart from stale. They send the reader to the same
 * command and mean different things.
 */
function requireFreshPackage(): void {
  const entry = resolve(__dirname, 'dist/renderer/index.js');

  let built: number;
  try {
    built = statSync(entry).mtimeMs;
  } catch {
    throw new Error(
      'No renderer package at dist/renderer/index.js. The capture fixture ' +
        'imports @stuffbucket/maximal-electron/renderer, which resolves there. ' +
        'Run `npm run build:package` first.',
    );
  }

  const source = newestMtime(resolve(__dirname, 'src/renderer'));
  if (source === undefined || source <= built) return;

  const behind = Math.round((source - built) / 1000);
  throw new Error(
    `dist/renderer is ${String(behind)}s older than src/renderer. ` +
      'Run `npm run build:package` first, or the capture fixture is built ' +
      'against the previous exports and a recording of it proves nothing.',
  );
}

// The capture fixture's renderer.
//
// A second Forge renderer entry, built beside the product's and kept out of the
// package by the `ignore` predicate in `forge.config.ts`. It exists so the demo
// shell is a separate bundle rather than dead weight inside the one a user
// installs.
//
// Every import in it resolves through this package's own `exports` map, which
// is what makes it a consumer rather than an insider. `npm run
// verify:fixture-imports` fails if one stops doing so.
//
// `outDir` is absolute for the same reason `vite.renderer.config.ts` needs it:
// Forge's default is relative to the root it sets, so overriding `root` sends
// the output to `e2e/fixtures/demo-shell/.vite/...` and it never reaches the
// build. `emptyOutDir` is explicit because Vite will not clear a directory
// outside its root without being told.
export default defineConfig(() => {
  requireFreshPackage();

  return {
    root,
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, '.vite/renderer/demo_window'),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(root, 'index.html') },
      },
    },
  };
});
