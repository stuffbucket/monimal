/**
 * Where Electron's binary download lands, and what is in there.
 *
 * Electron 43 has no `postinstall`: `node_modules/electron/index.js` downloads
 * the binary the first time something resolves the executable path, which here
 * is `electron-forge package`. `@electron/packager` fetches a second copy for
 * the target through `@electron/get` without passing a `cacheRoot`, so both
 * land in `@electron/get`'s default — a different directory on each operating
 * system, computed here rather than read from documentation.
 *
 * `electron_config_cache` is honoured because `install.js` honours it. CI does
 * not set it: packager ignores it, and a pinned root that only half the
 * downloads use is a cache that looks populated and is not.
 *
 * Kept pure, and separate from the script that reads the directory, so both
 * the path and the matching are mutation tested rather than trusted.
 */

import path from 'node:path';

/** The one name `@electron/get` writes: `electron-v<version>-<platform>-<arch>.zip`. */
const PREFIX = 'electron-v';
const SUFFIX = '.zip';

/** The line an `actions/cache` step declares its key on, and what it must name. */
const KEY = 'key:';
const KEY_MUST_NAME = ['runner.os', 'runner.arch', 'outputs.version'];

/**
 * `@electron/get`'s default cache root, which is `env-paths('electron').cache`.
 *
 * Read out of `node_modules/env-paths/index.js`, not from a document: macOS
 * puts it under `Library/Caches`, Windows under `LOCALAPPDATA` in a folder
 * called `Cache`, and everything else follows the XDG base directory rules.
 */
export function defaultCacheRoot({ platform, home, env }) {
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Caches', 'electron');
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] ?? path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(local, 'electron', 'Cache');
  }
  const cache = env['XDG_CACHE_HOME'] ?? path.posix.join(home, '.cache');
  return path.posix.join(cache, 'electron');
}

/** The root in use: what `install.js` was told, or the default it falls back to. */
export function resolveCacheRoot({ platform, home, env }) {
  const pinned = env['electron_config_cache'];
  if (pinned !== undefined && pinned !== '') return pinned;
  return defaultCacheRoot({ platform, home, env });
}

/**
 * The `key:` values an `actions/cache` step declares, in source order.
 *
 * A line scan rather than a YAML parse: this runs before `npm ci`, so it
 * cannot import the `yaml` package, and the shape it reads is one line.
 */
export function cacheKeys(text) {
  const keys = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(KEY)) continue;
    keys.push(trimmed.slice(KEY.length).trim());
  }
  return keys;
}

/**
 * What a cache key omits, of the three things that make it correct.
 *
 * Drop the version and a bump restores the previous binary. Drop the operating
 * system or the architecture and a runner restores another platform's. This is
 * checked against the key rather than against the symptom, because the symptom
 * only appears on the run after the mistake.
 */
export function keyOmissions(key) {
  return KEY_MUST_NAME.filter((term) => !key.includes(term));
}

/** The three fields that name a download, or undefined when it is not one. */
export function parseDownload(name) {
  if (!name.startsWith(PREFIX)) return undefined;
  if (!name.endsWith(SUFFIX)) return undefined;

  // A prerelease version carries its own dashes, so platform and arch come off
  // the end and the remainder is the version.
  const parts = name.slice(PREFIX.length, -SUFFIX.length).split('-');
  if (parts.length < 3) return undefined;

  const arch = parts.pop();
  const platform = parts.pop();
  return { version: parts.join('-'), platform, arch };
}

/**
 * The downloads in a cache root, and the one this runner wanted.
 *
 * `wanted` is empty when nothing in the job ever resolved the Electron binary,
 * which is what caching an empty directory forever looks like from here.
 */
export function inspectCache({ names, version, platform, arch }) {
  const downloads = [];
  for (const name of names) {
    const download = parseDownload(name);
    if (download !== undefined) downloads.push(download);
  }

  return {
    downloads,
    wanted: downloads.filter(
      (download) =>
        download.version === version && download.platform === platform && download.arch === arch,
    ),
  };
}
