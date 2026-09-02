import { describe, expect, it } from 'vitest';

import { hoistedDependencies } from '../scripts/package-contract.mjs';

/**
 * Which packages travel inside a packaged build.
 *
 * `packagerConfig.prune` is off and the keep-list names directories, so a
 * dependency of a kept native module that the installer put somewhere else
 * never reached the archive. `node-llama-cpp` lost `universalify` that way and
 * the packaged library could not load at all — issue #133, and the reason this
 * function derives the closure instead of a hand-list.
 *
 * It had no test. It resolved by hand-reimplementing Node's algorithm and got
 * it wrong in two ways that only appear under pnpm, which is this workspace's
 * package manager: `npm run package` failed with "node-pty depends on
 * node-addon-api, which is not installed" against an install where Node
 * resolves it in one hop. Nothing else could see it — the `electron package`
 * job in CI packages `packages/maximal/client`, whose Forge config does not
 * call this.
 *
 * A fake filesystem rather than a fixture on disk, because the layouts that
 * matter include symlinks and an enclosing checkout, and both are awkward to
 * commit and easy to describe.
 */

/** A directory tree, as a set of package directories and their dependencies. */
type Package = { dependencies?: Record<string, string>; optional?: Record<string, string> };
type Tree = Record<string, Record<string, string> | Package | null>;

/**
 * `io` over a plain object, with a symlink table.
 *
 * `realpath` is the whole point of several of these cases, so links are
 * modelled as a prefix rewrite: the shallowest matching link wins, which is
 * what a real path walk does.
 */
function fakeIo(tree: Tree, links: Record<string, string> = {}) {
  const realpath = (target: string): string => {
    for (const [link, actual] of Object.entries(links)) {
      if (target === link) return actual;
      if (target.startsWith(`${link}/`)) return actual + target.slice(link.length);
    }
    return target;
  };

  return {
    sep: '/',
    join: (...parts: string[]) => {
      const joined = parts.join('/');
      const out: string[] = [];
      for (const part of joined.split('/')) {
        if (part === '' && out.length > 0) continue;
        if (part === '.') continue;
        if (part === '..') {
          if (out.length > 1) out.pop();
          continue;
        }
        out.push(part);
      }
      return out.join('/') || '/';
    },
    basename: (target: string) => target.split('/').filter(Boolean).at(-1) ?? '',
    realpath,
    readPackageJson: (dir: string) => {
      const entry = tree[realpath(dir)];
      if (entry === undefined) return undefined;
      if (entry === null) return { dependencies: {} };
      if ('dependencies' in entry || 'optional' in entry) {
        const shaped = entry as Package;
        return {
          dependencies: shaped.dependencies ?? {},
          optionalDependencies: shaped.optional ?? {},
        };
      }
      return { dependencies: entry as Record<string, string> };
    },
  };
}

describe('the closure a packaged build has to carry', () => {
  it('finds a dependency the installer hoisted to the top level', () => {
    // The npm layout, and the case issue #133 was about: the dependency is not
    // beside the module, so the keep-list has to name it separately.
    const io = fakeIo({
      '/app/node_modules/node-pty': { 'node-addon-api': '^7' },
      '/app/node_modules/node-addon-api': null,
    });

    expect(hoistedDependencies(io, '/app/node_modules', ['node-pty'])).toEqual(['node-addon-api']);
  });

  it('finds a dependency pnpm put beside the module, through the symlink', () => {
    /*
     * The layout this workspace actually installs, and the one that was
     * broken. `<pkg>/node_modules/node-pty` is a link into the store, and the
     * dependency is its *sibling* there rather than inside it — so the answer
     * is one hop up from the real path and nowhere at all from the link path.
     *
     * Nothing is hoisted to the package's own `node_modules`, so the closure
     * is empty and that is the correct answer: what travels is the store
     * directory, which already contains both.
     */
    const store = '/ws/node_modules/.pnpm/node-pty@1.2.0/node_modules';
    const io = fakeIo(
      {
        [`${store}/node-pty`]: { 'node-addon-api': '^7' },
        [`${store}/node-addon-api`]: null,
      },
      { '/ws/packages/app/node_modules/node-pty': `${store}/node-pty` },
    );

    expect(hoistedDependencies(io, '/ws/packages/app/node_modules', ['node-pty'])).toEqual([]);
  });

  it('prefers a nested copy over the hoisted one', () => {
    // Node's rule, and the reason a nested copy is not listed: it already
    // travels inside the directory that owns it.
    const io = fakeIo({
      '/app/node_modules/node-pty': { 'node-addon-api': '^7' },
      '/app/node_modules/node-pty/node_modules/node-addon-api': null,
      '/app/node_modules/node-addon-api': null,
    });

    expect(hoistedDependencies(io, '/app/node_modules', ['node-pty'])).toEqual([]);
  });

  it('follows the closure past the first level', () => {
    const io = fakeIo({
      '/app/node_modules/node-llama-cpp': { 'fs-extra': '^11' },
      '/app/node_modules/fs-extra': { universalify: '^2' },
      '/app/node_modules/universalify': null,
    });

    expect(hoistedDependencies(io, '/app/node_modules', ['node-llama-cpp'])).toEqual([
      'fs-extra',
      'universalify',
    ]);
  });

  it('throws rather than shipping a build that cannot load', () => {
    // The whole point. A silently dropped dependency builds cleanly and fails
    // at run time, in a packaged application, on somebody else's machine.
    const io = fakeIo({ '/app/node_modules/node-pty': { 'node-addon-api': '^7' } });

    expect(() => hoistedDependencies(io, '/app/node_modules', ['node-pty'])).toThrow(
      /node-pty depends on node-addon-api/,
    );
  });

  it('refuses to resolve against a checkout that encloses this one', () => {
    /*
     * The guard the realpath change had to keep. A project living inside
     * another project's `node_modules` must not satisfy its dependencies from
     * the outer tree: the packaged build would name a package this install
     * does not have.
     *
     * It is why the walk still stops at the project root while it is under it.
     * A real path that leaves the project — pnpm's store belongs to the
     * workspace, above the package — is the case the stop no longer applies
     * to, and the test above covers that.
     */
    const io = fakeIo({
      '/outer/node_modules/inner/node_modules/node-pty': { 'node-addon-api': '^7' },
      '/outer/node_modules/node-addon-api': null,
    });

    expect(() =>
      hoistedDependencies(io, '/outer/node_modules/inner/node_modules', ['node-pty']),
    ).toThrow(/not installed/);
  });

  it('stops rather than walking out of every node_modules tree', () => {
    // Above the outermost `node_modules` there is nothing but whatever
    // directory happens to enclose the checkout.
    const io = fakeIo({
      '/ws/node_modules/.pnpm/a@1/node_modules/a': { b: '^1' },
      '/b': null,
      '/node_modules/b': null,
    });

    expect(() => hoistedDependencies(io, '/ws/node_modules', ['.pnpm/a@1/node_modules/a'])).toThrow(
      /depends on b/,
    );
  });

  it('carries the optional dependency that is installed, and skips the rest', () => {
    /*
     * How every package that ships prebuilt binaries distributes them.
     * `node-llama-cpp` declares fourteen `@node-llama-cpp/*` platform builds
     * and the installer places the one that matches; absent is the normal case
     * for the other thirteen, so a miss is skipped rather than thrown on.
     *
     * The walk read none of them and got away with it under a flat install,
     * where the platform build is hoisted and the keep-list catches the whole
     * scope by prefix. Under pnpm there is no top-level path to catch, and the
     * bundle came out with no prebuild at all.
     */
    const io = fakeIo({
      '/app/node_modules/node-llama-cpp': {
        optional: { '@node-llama-cpp/mac-arm64': '^3', '@node-llama-cpp/win-x64': '^3' },
      },
      '/app/node_modules/@node-llama-cpp/mac-arm64': null,
    });

    expect(hoistedDependencies(io, '/app/node_modules', ['node-llama-cpp'])).toEqual([
      '@node-llama-cpp/mac-arm64',
    ]);
  });

  it('names a scoped package whole', () => {
    const io = fakeIo({
      '/app/node_modules/node-llama-cpp': { '@huggingface/jinja': '^0.3' },
      '/app/node_modules/@huggingface/jinja': null,
    });

    expect(hoistedDependencies(io, '/app/node_modules', ['node-llama-cpp'])).toEqual([
      '@huggingface/jinja',
    ]);
  });
});
