import { describe, expect, it } from 'vitest';

import {
  cacheKeys,
  defaultCacheRoot,
  inspectCache,
  keyOmissions,
  parseDownload,
  resolveCacheRoot,
} from '../scripts/electron-cache.mjs';

/**
 * Where Electron's download lands, and what the cache root is allowed to hold.
 *
 * The path is asserted against `env-paths`, which is what `@electron/get` falls
 * back to, because the composite action caches whatever this returns. The
 * matching decides whether the job that was supposed to download Electron did.
 * A job that never resolves it caches an empty directory and reports a hit
 * forever, which is the shape of every check this repository has shipped with
 * an empty scope.
 */

describe('defaultCacheRoot', () => {
  it('is under Library/Caches on macOS', () => {
    expect(defaultCacheRoot({ platform: 'darwin', home: '/Users/x', env: {} })).toBe(
      '/Users/x/Library/Caches/electron',
    );
  });

  it('is a Cache folder under LOCALAPPDATA on Windows', () => {
    // A value the home-directory fallback cannot also produce, or the
    // assertion passes without ever reading the variable.
    expect(
      defaultCacheRoot({
        platform: 'win32',
        home: 'C:\\Users\\x',
        env: { LOCALAPPDATA: 'D:\\local' },
      }),
    ).toBe('D:\\local\\electron\\Cache');
  });

  it('falls back to AppData/Local when Windows does not say', () => {
    expect(defaultCacheRoot({ platform: 'win32', home: 'C:\\Users\\x', env: {} })).toBe(
      'C:\\Users\\x\\AppData\\Local\\electron\\Cache',
    );
  });

  it('follows the XDG rules everywhere else', () => {
    expect(defaultCacheRoot({ platform: 'linux', home: '/home/x', env: {} })).toBe(
      '/home/x/.cache/electron',
    );
    expect(
      defaultCacheRoot({ platform: 'linux', home: '/home/x', env: { XDG_CACHE_HOME: '/tmp/c' } }),
    ).toBe('/tmp/c/electron');
  });
});

describe('resolveCacheRoot', () => {
  it('takes electron_config_cache, because install.js does', () => {
    expect(
      resolveCacheRoot({
        platform: 'linux',
        home: '/home/x',
        env: { electron_config_cache: '/pinned' },
      }),
    ).toBe('/pinned');
  });

  it('ignores the variable when it is empty, rather than caching the working directory', () => {
    expect(
      resolveCacheRoot({ platform: 'linux', home: '/home/x', env: { electron_config_cache: '' } }),
    ).toBe('/home/x/.cache/electron');
  });

  it('falls back to the default when nothing pins it', () => {
    expect(resolveCacheRoot({ platform: 'darwin', home: '/Users/x', env: {} })).toBe(
      '/Users/x/Library/Caches/electron',
    );
  });
});

describe('parseDownload', () => {
  it('reads the version, the platform, and the arch off the name', () => {
    expect(parseDownload('electron-v43.2.0-darwin-arm64.zip')).toEqual({
      version: '43.2.0',
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('keeps a prerelease version whole, dashes and all', () => {
    // The version is what is left after platform and arch come off the end,
    // so a name with four dashes is still one version and two fields.
    expect(parseDownload('electron-v44.0.0-alpha.1-win32-x64.zip')).toEqual({
      version: '44.0.0-alpha.1',
      platform: 'win32',
      arch: 'x64',
    });
  });

  it('reads a linux name', () => {
    expect(parseDownload('electron-v43.2.0-linux-x64.zip')).toEqual({
      version: '43.2.0',
      platform: 'linux',
      arch: 'x64',
    });
  });

  it('refuses a name that is not an Electron download', () => {
    expect(parseDownload('SHASUMS256.txt')).toBeUndefined();
    expect(parseDownload('chromedriver-v43.2.0-darwin-arm64.zip')).toBeUndefined();
    expect(parseDownload('electron-v43.2.0-darwin-arm64.zip.part')).toBeUndefined();
    expect(parseDownload('electron-v43.2.0-darwin-arm64')).toBeUndefined();
  });

  it('refuses a name with no platform and arch to take off the end', () => {
    expect(parseDownload('electron-v43.2.0-darwin.zip')).toBeUndefined();
    expect(parseDownload('electron-v43.2.0.zip')).toBeUndefined();
  });
});

describe('inspectCache', () => {
  const wanted = { version: '43.2.0', platform: 'darwin', arch: 'arm64' };

  it('finds the download the runner needs', () => {
    const result = inspectCache({
      names: ['electron-v43.2.0-darwin-arm64.zip'],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(1);
    expect(result.wanted).toEqual([
      { version: '43.2.0', platform: 'darwin', arch: 'arm64' },
    ]);
  });

  it('reports an empty root as no downloads rather than as a match', () => {
    const result = inspectCache({ names: [], ...wanted });
    expect(result.downloads).toEqual([]);
    expect(result.wanted).toEqual([]);
  });

  it('drops the files that are not downloads', () => {
    const result = inspectCache({
      names: ['SHASUMS256.txt', 'electron-v43.2.0-darwin-arm64.zip'],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(1);
  });

  it('keeps another version out of the match, whatever else is in the root', () => {
    const result = inspectCache({
      names: ['electron-v39.2.4-darwin-arm64.zip', 'electron-v43.2.0-darwin-arm64.zip'],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(2);
    expect(result.wanted).toHaveLength(1);
  });

  it('does not match another platform or another arch at the same version', () => {
    const result = inspectCache({
      names: [
        'electron-v43.2.0-linux-x64.zip',
        'electron-v43.2.0-darwin-x64.zip',
        'electron-v43.2.0-linux-arm64.zip',
      ],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(3);
    expect(result.wanted).toEqual([]);
  });
});

/**
 * The key is checked rather than the symptom.
 *
 * A key that stops naming the Electron version restores the previous binary,
 * and that appears one run after the mistake. The contents cannot show it: a
 * developer's shared cache root legitimately holds several versions.
 */
describe('cacheKeys', () => {
  it('reads the key off an actions/cache step', () => {
    const yaml = [
      '    - id: restore',
      '      uses: actions/cache@v4',
      '      with:',
      '        path: ${{ steps.resolve.outputs.root }}',
      '        key: electron-${{ runner.os }}-${{ runner.arch }}-${{ steps.resolve.outputs.version }}',
    ].join('\n');
    expect(cacheKeys(yaml)).toEqual([
      'electron-${{ runner.os }}-${{ runner.arch }}-${{ steps.resolve.outputs.version }}',
    ]);
  });

  it('finds every key, not only the first', () => {
    expect(cacheKeys('  key: a\n  path: x\n  key: b\n')).toEqual(['a', 'b']);
  });

  it('finds none in a file that declares no cache, so the floor can fire', () => {
    expect(cacheKeys('name: something\nruns:\n  using: composite\n')).toEqual([]);
  });

  it('does not read a line that merely ends in key:', () => {
    expect(cacheKeys('  description: the cache key:\n')).toEqual([]);
  });
});

describe('keyOmissions', () => {
  it('accepts a key that names the runner and the version', () => {
    expect(
      keyOmissions('electron-${{ runner.os }}-${{ runner.arch }}-${{ steps.resolve.outputs.version }}'),
    ).toEqual([]);
  });

  it('names the version when a bump would restore the old binary', () => {
    expect(keyOmissions('electron-${{ runner.os }}-${{ runner.arch }}')).toEqual([
      'outputs.version',
    ]);
  });

  it('names the operating system and the architecture when a runner would take another platform', () => {
    expect(keyOmissions('electron-${{ steps.resolve.outputs.version }}')).toEqual([
      'runner.os',
      'runner.arch',
    ]);
  });

  it('names all three for a key that is a bare string', () => {
    expect(keyOmissions('electron')).toEqual(['runner.os', 'runner.arch', 'outputs.version']);
  });
});
