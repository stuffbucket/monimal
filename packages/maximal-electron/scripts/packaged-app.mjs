/**
 * Where the packaged application is, and where a driver launches it from.
 *
 * `out/` sits inside this repository, so a package launched in place can reach
 * the repository's own `node_modules`. That would let the terminal load a
 * `node-pty` file the package does not carry.
 *
 * The packaged terminal check copies the artifact somewhere with nothing above
 * it first. `nodeModulesAbove` states that isolation as an assertion rather
 * than as an intention. The helper copies rather than moves because
 * `verify:package` still reads `out/`.
 */

import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The packaged application, and the two paths every driver needs from it.
 *
 * One definition of the layout. Both drivers derive the binary and the
 * resources directory from here, so a packager change moves them together.
 * Returns undefined on a platform this repository does not package.
 */
export function packagedApp(platform = process.platform, arch = process.arch, root = ROOT) {
  if (platform === 'darwin') {
    const directory = path.join(root, `out/Stuffbucket-darwin-${arch}`);
    const bundle = path.join(directory, 'Stuffbucket.app');
    return {
      directory,
      binary: path.join(bundle, 'Contents/MacOS/Stuffbucket'),
      resources: path.join(bundle, 'Contents/Resources'),
    };
  }
  if (platform === 'win32') {
    // The packaged directory rather than an installed tree: this repository
    // ships no installer.
    const directory = path.join(root, `out/Stuffbucket-win32-${arch}`);
    return {
      directory,
      binary: path.join(directory, 'Stuffbucket.exe'),
      resources: path.join(directory, 'resources'),
    };
  }
  return undefined;
}

/** Every directory an import from inside `directory` walks up through. */
export function ancestors(directory) {
  const walked = [];
  let at = path.resolve(directory);
  for (;;) {
    const up = path.dirname(at);
    if (up === at) return walked;
    walked.push(up);
    at = up;
  }
}

/** Those of them holding a `node_modules` the package could resolve into. */
export function nodeModulesAbove(directory) {
  return ancestors(directory)
    .map((at) => path.join(at, 'node_modules'))
    .filter((candidate) => {
      try {
        return readdirSync(candidate).length > 0;
      } catch {
        return false;
      }
    });
}

/** Files under a directory, symlinks counted as files rather than followed. */
export function countFiles(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1;
  }
  return total;
}

/**
 * Copy the package to a directory outside this repository, and hand back the
 * same three paths pointing into the copy.
 *
 * `verbatimSymlinks` keeps the `.app` bundle's `Versions/Current` links as
 * links. Dereferencing them would duplicate the Electron framework and change
 * the artifact under test.
 */
export function relocate(app) {
  const root = mkdtempSync(path.join(tmpdir(), 'stuffbucket-packaged-'));
  const directory = path.join(root, path.basename(app.directory));
  cpSync(app.directory, directory, { recursive: true, verbatimSymlinks: true });

  const moved = (target) => path.join(directory, path.relative(app.directory, target));
  return {
    root,
    directory,
    binary: moved(app.binary),
    resources: moved(app.resources),
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
