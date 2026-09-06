import { describe, expect, it } from 'vitest';

import { admitsTarget, platformPackagePlan } from '../scripts/package-contract.mjs';

/**
 * Which copied packages a build can actually run.
 *
 * `llamaPackagePlan` answers this for one scope by parsing its names. This
 * answers it for every package by reading the `os` and `cpu` fields npm
 * publishes, which is what makes it reach the ones nobody thought to name:
 * `@reflink/reflink-darwin-arm64` arrives three optional dependencies below
 * anything this package imports -- `node-llama-cpp` -> `ipull` ->
 * `@reflink/reflink` -- and a build for another platform copied it in.
 *
 * `forge.config.ts` deletes what the plan drops and `scripts/verify-package.mjs`
 * asserts nothing packed was dropped, both off this function. A wrong answer
 * here is invisible in both, which is why the answer is tested here.
 */

const keepsOf = (plan: { path: string; keep: boolean }[]) =>
  plan.filter((entry) => entry.keep).map((entry) => entry.path);

const dropsOf = (plan: { path: string; keep: boolean }[]) =>
  plan.filter((entry) => !entry.keep).map((entry) => entry.path);

/** The shape that motivated this: one sibling per target, installed by host. */
const REFLINK = { path: 'node_modules/@reflink/reflink-darwin-arm64', os: ['darwin'], cpu: ['arm64'] };

/** A package with no constraints at all, which is nearly all of the closure. */
const PLAIN = { path: 'node_modules/tar' };

describe('admitsTarget', () => {
  it('admits everything when the field is absent', () => {
    expect(admitsTarget(undefined, 'win32')).toBe(true);
  });

  it('admits everything when the field is empty', () => {
    expect(admitsTarget([], 'win32')).toBe(true);
  });

  it('reads a bare string as a list of one', () => {
    expect(admitsTarget('darwin', 'darwin')).toBe(true);
    expect(admitsTarget('darwin', 'win32')).toBe(false);
  });

  it('admits any', () => {
    expect(admitsTarget(['any'], 'win32')).toBe(true);
  });

  it('requires membership when the list includes', () => {
    expect(admitsTarget(['darwin', 'linux'], 'linux')).toBe(true);
    expect(admitsTarget(['darwin', 'linux'], 'win32')).toBe(false);
  });

  /*
   * The half a naive `includes` gets wrong. npm lets a list EXCLUDE, and a
   * list of nothing but exclusions admits every value it does not name --
   * `"os": ["!win32"]` is how a package says "anywhere but Windows", and
   * reading it as an allow-list drops that package from every build.
   */
  it('admits anything a purely negated list does not name', () => {
    expect(admitsTarget(['!win32'], 'darwin')).toBe(true);
    expect(admitsTarget(['!win32'], 'win32')).toBe(false);
  });

  it('lets an exclusion beat an inclusion', () => {
    expect(admitsTarget(['darwin', '!darwin'], 'darwin')).toBe(false);
  });

  it('rejects a value a mixed list neither includes nor excludes', () => {
    expect(admitsTarget(['darwin', '!win32'], 'linux')).toBe(false);
  });
});

describe('platformPackagePlan', () => {
  it('keeps a package with no constraints on every target', () => {
    const targets: [string, string][] = [
      ['darwin', 'arm64'],
      ['win32', 'x64'],
      ['linux', 'arm64'],
    ];
    for (const [platform, arch] of targets) {
      expect(keepsOf(platformPackagePlan([PLAIN], platform, arch))).toEqual(['node_modules/tar']);
    }
  });

  it('keeps a platform package on the target it builds for', () => {
    expect(keepsOf(platformPackagePlan([REFLINK], 'darwin', 'arm64'))).toEqual([REFLINK.path]);
  });

  it('drops it on another operating system', () => {
    const plan = platformPackagePlan([REFLINK], 'win32', 'x64');
    expect(dropsOf(plan)).toEqual([REFLINK.path]);
    expect(plan[0]?.reason).toBe('declares os darwin, not win32');
  });

  /*
   * The arch half, which the os half hides: a `darwin-x64` build made on an
   * Apple Silicon Mac agrees about the operating system and disagrees about
   * the only thing in the package, which is a Mach-O binary for the other
   * one.
   */
  it('drops it on another architecture of the same operating system', () => {
    const plan = platformPackagePlan([REFLINK], 'darwin', 'x64');
    expect(dropsOf(plan)).toEqual([REFLINK.path]);
    expect(plan[0]?.reason).toBe('declares cpu arm64, not x64');
  });

  /*
   * `mas` is a darwin build. Reading it as its own `process.platform` would
   * drop every native package from a Mac App Store bundle, which builds
   * cleanly and ships an application with no native modules in it.
   */
  it('treats mas as darwin', () => {
    expect(keepsOf(platformPackagePlan([REFLINK], 'mas', 'arm64'))).toEqual([REFLINK.path]);
  });

  /*
   * A universal build is two slices, and a package holding a binary for
   * either one is needed by half the bundle. Judging it against a single
   * arch drops both halves' native code.
   */
  it('keeps a package either slice of a universal build needs', () => {
    const x64Only = { path: 'node_modules/@reflink/reflink-darwin-x64', os: ['darwin'], cpu: ['x64'] };
    expect(keepsOf(platformPackagePlan([REFLINK, x64Only], 'darwin', 'universal'))).toEqual([
      REFLINK.path,
      x64Only.path,
    ]);
  });

  it('still drops another operating system from a universal build', () => {
    const windows = {
      path: 'node_modules/@reflink/reflink-win32-x64-msvc',
      os: ['win32'],
      cpu: ['x64'],
    };
    expect(dropsOf(platformPackagePlan([windows], 'darwin', 'universal'))).toEqual([windows.path]);
  });

  it('sorts by path, so the build log and the check read alike', () => {
    const plan = platformPackagePlan(
      [{ path: 'node_modules/z' }, { path: 'node_modules/a' }, { path: 'node_modules/m' }],
      'linux',
      'x64',
    );
    expect(plan.map((entry) => entry.path)).toEqual([
      'node_modules/a',
      'node_modules/m',
      'node_modules/z',
    ]);
  });

  it('judges nothing when handed nothing, rather than passing', () => {
    expect(platformPackagePlan([], 'linux', 'x64')).toEqual([]);
  });
});
