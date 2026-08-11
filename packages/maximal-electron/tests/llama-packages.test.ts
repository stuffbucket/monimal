import { describe, expect, it } from 'vitest';

import {
  LLAMA_BACKENDS_VARIABLE,
  OPTIONAL_LLAMA_BACKENDS,
  llamaPackagePlan,
  parseLlamaBackends,
  parseLlamaPackage,
} from '../scripts/package-contract.mjs';

/**
 * Which `@node-llama-cpp` packages a build ships.
 *
 * `forge.config.ts` deletes what the plan drops and `scripts/verify-package.mjs`
 * derives its per-library expectation from what the plan keeps, so a wrong
 * answer here is invisible in both: the package loses a backend and the check
 * stops asking for it in the same edit. Issue #113.
 */

/** What npm installs on a Windows x64 host, `cpu` field and all. */
const WINDOWS_X64 = [
  'win-arm64',
  'win-x64',
  'win-x64-cuda',
  'win-x64-cuda-ext',
  'win-x64-vulkan',
];

/** What npm installs on a Linux x64 host. Same shape, one more backend. */
const LINUX_X64 = [
  'linux-arm64',
  'linux-x64',
  'linux-x64-cuda',
  'linux-x64-cuda-ext',
  'linux-x64-vulkan',
];

const keepsOf = (plan: { name: string; keep: boolean }[]) =>
  plan.filter((entry) => entry.keep).map((entry) => entry.name);

const dropsOf = (plan: { name: string; keep: boolean }[]) =>
  plan.filter((entry) => !entry.keep).map((entry) => entry.name);

describe('parseLlamaPackage', () => {
  it('splits an os, an arch, and a backend', () => {
    expect(parseLlamaPackage('win-x64-cuda')).toEqual({
      os: 'win',
      arch: 'x64',
      backend: 'cuda',
    });
  });

  it('reads a package with no backend as the CPU build', () => {
    expect(parseLlamaPackage('linux-arm64')).toEqual({
      os: 'linux',
      arch: 'arm64',
      backend: '',
    });
  });

  // `-ext` is not selectable on its own: `node-llama-cpp` reaches
  // `win-x64-cuda-ext` only through the cuda branch of its resolver, so it has
  // to travel with `win-x64-cuda` or not at all.
  it('attributes an -ext package to the backend it extends', () => {
    expect(parseLlamaPackage('win-x64-cuda-ext').backend).toBe('cuda');
  });

  it('reads mac-arm64-metal as a backend rather than a bare target', () => {
    expect(parseLlamaPackage('mac-arm64-metal')).toEqual({
      os: 'mac',
      arch: 'arm64',
      backend: 'metal',
    });
  });

  it('throws on a name the scope layout does not explain', () => {
    expect(() => parseLlamaPackage('bins')).toThrow(/layout has changed/);
  });
});

describe('parseLlamaBackends', () => {
  it('asks for nothing when the variable is unset', () => {
    expect(parseLlamaBackends(undefined)).toEqual([]);
    expect(parseLlamaBackends('')).toEqual([]);
    expect(parseLlamaBackends('  ')).toEqual([]);
  });

  it('reads a comma separated list', () => {
    expect(parseLlamaBackends('cuda, vulkan')).toEqual(['cuda', 'vulkan']);
  });

  it('expands all', () => {
    expect(parseLlamaBackends('all')).toEqual([...OPTIONAL_LLAMA_BACKENDS]);
  });

  // Silently ignoring it would ship a CPU-only package to someone who wrote
  // `CUDA` and believes they asked for the opposite.
  it('throws on a name it does not know', () => {
    expect(() => parseLlamaBackends('CUDA')).toThrow(LLAMA_BACKENDS_VARIABLE);
    expect(() => parseLlamaBackends('cuda,metal')).toThrow(/metal/);
  });
});

describe('llamaPackagePlan', () => {
  it('drops the arm64 package npm installs on a win32-x64 host', () => {
    const plan = llamaPackagePlan(WINDOWS_X64, 'win32', 'x64', []);
    expect(dropsOf(plan)).toContain('win-arm64');
    expect(
      plan.find((entry) => entry.name === 'win-arm64')?.reason,
    ).toBe('builds for arm64, not x64');
  });

  it('keeps only the CPU package on win32-x64 by default', () => {
    expect(keepsOf(llamaPackagePlan(WINDOWS_X64, 'win32', 'x64', []))).toEqual(['win-x64']);
  });

  it('keeps cuda and its ext package together when asked', () => {
    expect(keepsOf(llamaPackagePlan(WINDOWS_X64, 'win32', 'x64', ['cuda']))).toEqual([
      'win-x64',
      'win-x64-cuda',
      'win-x64-cuda-ext',
    ]);
  });

  it('has the same shape on linux-x64', () => {
    expect(keepsOf(llamaPackagePlan(LINUX_X64, 'linux', 'x64', []))).toEqual(['linux-x64']);
    expect(dropsOf(llamaPackagePlan(LINUX_X64, 'linux', 'x64', []))).toEqual([
      'linux-arm64',
      'linux-x64-cuda',
      'linux-x64-cuda-ext',
      'linux-x64-vulkan',
    ]);
  });

  // Metal is not an optional backend. It is the only mac-arm64 package, so
  // dropping it leaves that target with no llama.cpp rather than a slower one.
  it('keeps metal on mac-arm64 without being asked', () => {
    expect(keepsOf(llamaPackagePlan(['mac-arm64-metal'], 'darwin', 'arm64', []))).toEqual([
      'mac-arm64-metal',
    ]);
  });

  it('drops the arm64 metal package on a mac-x64 build', () => {
    const installed = ['mac-arm64-metal', 'mac-x64'];
    expect(keepsOf(llamaPackagePlan(installed, 'darwin', 'x64', []))).toEqual(['mac-x64']);
  });

  it('keeps both arches for a universal build', () => {
    const installed = ['mac-arm64-metal', 'mac-x64'];
    expect(keepsOf(llamaPackagePlan(installed, 'darwin', 'universal', []))).toEqual(installed);
  });

  it('treats mas as darwin', () => {
    expect(keepsOf(llamaPackagePlan(['mac-arm64-metal'], 'mas', 'arm64', []))).toEqual([
      'mac-arm64-metal',
    ]);
  });

  it('accounts for every installed package', () => {
    const plan = llamaPackagePlan(WINDOWS_X64, 'win32', 'x64', ['vulkan']);
    expect(plan).toHaveLength(WINDOWS_X64.length);
    expect(plan.map((entry) => entry.name)).toEqual([...WINDOWS_X64].sort());
  });

  it('throws for a platform with no package naming', () => {
    expect(() => llamaPackagePlan(WINDOWS_X64, 'aix', 'x64', [])).toThrow(/platform aix/);
  });
});
