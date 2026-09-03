import { describe, expect, it } from 'vitest';

import { externalClosure, hoistedDependencies } from '../scripts/package-contract.mjs';

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
  /*
   * Resolves repeatedly, because the real one resolves every component and
   * keeps going when a target is itself a link. The predecessor rewrote one
   * prefix once, so `link1 -> link2 -> /real` stopped at `link2` — and a
   * store package's entries are themselves links into other store
   * directories, which is the shape these tests exist to model.
   */
  const realpath = (target: string): string => {
    let current = target;
    for (let step = 0; step < 32; step += 1) {
      const hit = Object.entries(links).find(
        ([link]) => current === link || current.startsWith(`${link}/`),
      );
      if (hit === undefined) return current;
      current = hit[1] + current.slice(hit[0].length);
    }
    return current;
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

    // The boundary is the workspace root, which is what the callers pass. The
    // default — the project root — is above nothing here: pnpm's store belongs
    // to the workspace, so a walk bounded by the package resolves none of it.
    expect(
      hoistedDependencies(io, '/ws/packages/app/node_modules', ['node-pty'], { boundary: '/ws' }),
    ).toEqual([]);
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

describe('where each package goes in the bundle', () => {
  /*
   * `externalClosure` is what the build consumes, and until now no test called
   * it. Every test above goes through `hoistedDependencies`, which returns
   * names only — so nothing asserted a single directory or placement, and a
   * closure that resolved everything to the wrong place returned exactly the
   * answer a correct one does.
   *
   * That is how the version-collapsing defect shipped. The closure kept a
   * `name -> directory` map, one version of each name survived, and the hook
   * flattened the survivors into the bundle. Sixteen names in this
   * repository's real closure resolve to more than one version;
   * `restore-cursor` was handed the `signal-exit` with no `onExit` export and
   * `node-llama-cpp` could not be imported at all.
   */
  const boundary = { boundary: '/ws' };

  it('puts a package at the top level when nothing contests the name', () => {
    const io = fakeIo({
      '/ws/app/node_modules/node-pty': { 'node-addon-api': '^7' },
      '/ws/app/node_modules/node-addon-api': null,
    });

    expect(externalClosure(io, '/ws/app/node_modules', ['node-pty'], boundary)).toEqual([
      { name: 'node-addon-api', dir: '/ws/app/node_modules/node-addon-api', path: 'node_modules/node-addon-api' },
    ]);
  });

  it('nests the second version under the package that asked for it', () => {
    /*
     * The defect, as a test. Two dependents need different versions of one
     * name; the top-level slot goes to the first and the second nests, which
     * is npm's own rule. Collapsing them by name — what the first attempt did
     * — puts one version where the other is required and the tree stops
     * loading.
     */
    const store = '/ws/node_modules/.pnpm';
    const io = fakeIo({
      [`${store}/root@1/node_modules/root`]: { alpha: '^1', beta: '^1' },
      [`${store}/alpha@1/node_modules/alpha`]: { shared: '^4' },
      [`${store}/alpha@1/node_modules/shared`]: null,
      [`${store}/beta@1/node_modules/beta`]: { shared: '^3' },
      [`${store}/beta@1/node_modules/shared`]: null,
    }, {
      '/ws/app/node_modules/root': `${store}/root@1/node_modules/root`,
      [`${store}/root@1/node_modules/alpha`]: `${store}/alpha@1/node_modules/alpha`,
      [`${store}/root@1/node_modules/beta`]: `${store}/beta@1/node_modules/beta`,
    });

    const closure = externalClosure(io, '/ws/app/node_modules', ['root'], boundary);
    const paths = closure.map((entry) => entry.path).sort();

    // One `shared` at the top, one nested — never one entry for two versions.
    expect(paths.filter((entry) => entry.endsWith('shared'))).toHaveLength(2);
    expect(paths).toContain('node_modules/shared');
    expect(paths.some((entry) => /node_modules\/(alpha|beta)\/node_modules\/shared/.test(entry))).toBe(
      true,
    );

    // And the two point at different directories, which is the whole reason.
    const dirs = new Set(closure.filter((e) => e.name === 'shared').map((e) => e.dir));
    expect(dirs.size).toBe(2);
  });

  it('gives one directory one placement however many dependents reach it', () => {
    const io = fakeIo({
      '/ws/app/node_modules/root': { alpha: '^1', beta: '^1' },
      '/ws/app/node_modules/alpha': { shared: '^1' },
      '/ws/app/node_modules/beta': { shared: '^1' },
      '/ws/app/node_modules/shared': null,
    });

    const paths = externalClosure(io, '/ws/app/node_modules', ['root'], boundary).map((e) => e.path);
    expect(paths.filter((entry) => entry.endsWith('shared'))).toEqual(['node_modules/shared']);
  });

  it('survives a dependency cycle', () => {
    // `visited` is keyed on placement rather than directory, so a cycle has to
    // terminate on the placement it has already produced.
    const io = fakeIo({
      '/ws/app/node_modules/root': { alpha: '^1' },
      '/ws/app/node_modules/alpha': { beta: '^1' },
      '/ws/app/node_modules/beta': { alpha: '^1' },
    });

    expect(externalClosure(io, '/ws/app/node_modules', ['root'], boundary).map((e) => e.path)).toEqual([
      'node_modules/alpha',
      'node_modules/beta',
    ]);
  });

  it('never leaves the boundary it was given', () => {
    /*
     * The guard, tested on the layout it has to hold for. The previous version
     * computed "am I still under the project root" from the *real* path, which
     * under pnpm is always in the workspace store above the project — so the
     * condition was false everywhere and the only remaining bound was "does
     * this path contain a node_modules segment", true for
     * `/outer/node_modules/inner` and therefore no bound at all.
     *
     * Here the project lives inside an outer checkout's `node_modules` and the
     * dependency exists only in that outer tree. Resolving it would put a
     * package this install does not have into the bundle.
     */
    const store = '/outer/node_modules/ws/node_modules/.pnpm';
    const io = fakeIo({
      [`${store}/node-pty@1/node_modules/node-pty`]: { evil: '^1' },
      '/outer/node_modules/evil': null,
    }, {
      '/outer/node_modules/ws/packages/app/node_modules/node-pty': `${store}/node-pty@1/node_modules/node-pty`,
    });

    expect(() =>
      externalClosure(io, '/outer/node_modules/ws/packages/app/node_modules', ['node-pty'], {
        boundary: '/outer/node_modules/ws',
      }),
    ).toThrow(/depends on evil/);
  });

  it('resolves through a link whose target is itself a link', () => {
    // pnpm's store entries are links into other store directories, so a real
    // path walk keeps going. A single-rewrite fake cannot model that, and the
    // one this file used to carry could not.
    const io = fakeIo({
      '/ws/real/node_modules/pkg': { dep: '^1' },
      '/ws/real/node_modules/dep': null,
    }, {
      '/ws/app/node_modules/pkg': '/ws/hop/node_modules/pkg',
      '/ws/hop': '/ws/real',
    });

    expect(externalClosure(io, '/ws/app/node_modules', ['pkg'], boundary).map((e) => e.path)).toEqual([
      'node_modules/dep',
    ]);
  });

  it('searches a node_modules directory itself, not a node_modules inside it', () => {
    /*
     * Node's rule, isolated. Under pnpm a package's dependencies are its
     * siblings, so the answer is the directory the package sits in — and
     * appending `node_modules` to it looks one level too deep.
     *
     * The boundary is that directory, which is what makes the two behaviours
     * differ. Without it the walk climbs one more step and the wrong rule
     * still lands on the right answer by coincidence of pnpm's shape, which is
     * why this needs saying explicitly rather than relying on the layout tests
     * above.
     */
    const io = fakeIo({
      '/ws/store/node_modules/pkg': { dep: '^1' },
      '/ws/store/node_modules/dep': null,
    });

    expect(
      externalClosure(io, '/ws/store/node_modules', ['pkg'], {
        boundary: '/ws/store/node_modules',
      }).map((entry) => entry.path),
    ).toEqual(['node_modules/dep']);
  });
});
