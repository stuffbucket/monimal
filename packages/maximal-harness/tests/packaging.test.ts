import { describe, expect, it } from 'vitest';

import { llamaPackageChecks } from '../scripts/llama-package-checks.mjs';
import {
  LLAMA_BACKENDS_VARIABLE,
  OPTIONAL_LLAMA_BACKENDS,
  llamaPackagePlan,
  parseLlamaBackends,
  parseLlamaPackage,
} from '../scripts/llama-packaging.mjs';

const keeps = <T extends { keep: boolean }>(plan: T[]) =>
  plan.filter((entry) => entry.keep);
const failures = (checks: Array<{ name: string; ok: boolean }>) =>
  checks.filter(({ ok }) => !ok).map(({ name }) => name);

describe('llama package selection', () => {
  it('parses target and backend package names', () => {
    expect(parseLlamaPackage('win-x64-cuda-fast-ext')).toEqual({
      os: 'win',
      arch: 'x64',
      backend: 'cuda-fast',
    });
    expect(parseLlamaPackage('linux-arm64')).toEqual({
      os: 'linux',
      arch: 'arm64',
      backend: '',
    });
    expect(() => parseLlamaPackage('bins')).toThrow(
      '@node-llama-cpp/bins is not named <os>-<arch>[-<backend>]. The scope layout has changed and this build cannot tell what it ships.',
    );
  });

  it('validates optional backend requests', () => {
    expect(parseLlamaBackends(undefined)).toEqual([]);
    expect(parseLlamaBackends('all')).toEqual([...OPTIONAL_LLAMA_BACKENDS]);
    expect(parseLlamaBackends('cuda, vulkan')).toEqual(['cuda', 'vulkan']);
    expect(() => parseLlamaBackends('metal, rocm')).toThrow(
      `${LLAMA_BACKENDS_VARIABLE} names metal, rocm. Valid names are cuda, vulkan, or all.`,
    );
  });

  it('keeps only the target CPU build by default', () => {
    const present = [
      'win-arm64',
      'win-x64',
      'win-x64-cuda',
      'win-x64-cuda-ext',
      'win-x64-vulkan',
    ];
    expect(
      keeps(llamaPackagePlan(present, 'win32', 'x64', [])).map(
        ({ name }) => name,
      ),
    ).toEqual(['win-x64']);
    expect(
      keeps(llamaPackagePlan(present, 'win32', 'x64', ['cuda'])).map(
        ({ name }) => name,
      ),
    ).toEqual(['win-x64', 'win-x64-cuda', 'win-x64-cuda-ext']);
  });

  it('keeps Metal and both slices for universal macOS', () => {
    const present = ['mac-arm64-metal', 'mac-x64'];
    expect(
      keeps(llamaPackagePlan(present, 'darwin', 'universal', [])).map(
        ({ name }) => name,
      ),
    ).toEqual(present);
  });

  it('sorts and explains every target decision', () => {
    expect(
      llamaPackagePlan(
        ['win-x64-vulkan', 'linux-x64', 'win-arm64', 'win-x64', 'win-x64-cuda'],
        'win32',
        'x64',
        ['cuda'],
      ),
    ).toEqual([
      { name: 'linux-x64', keep: false, reason: 'builds for linux, not win' },
      { name: 'win-arm64', keep: false, reason: 'builds for arm64, not x64' },
      { name: 'win-x64', keep: true, reason: 'the CPU build for this target' },
      { name: 'win-x64-cuda', keep: true, reason: 'the cuda backend' },
      {
        name: 'win-x64-vulkan',
        keep: false,
        reason: `the vulkan backend is not in ${LLAMA_BACKENDS_VARIABLE}`,
      },
    ]);
  });

  it('explains a foreign architecture for a universal target', () => {
    expect(llamaPackagePlan(['mac-riscv'], 'darwin', 'universal', [])).toEqual([
      {
        name: 'mac-riscv',
        keep: false,
        reason: 'builds for riscv, not x64 or arm64',
      },
    ]);
  });

  it('fails on a platform with no package naming policy', () => {
    expect(() => llamaPackagePlan([], 'freebsd', 'x64', [])).toThrow(
      'No @node-llama-cpp package name is known for platform freebsd.',
    );
  });
});

describe('llama package checks', () => {
  const valid = {
    packedFiles: [
      '.vite/build/llama-worker.js',
      'node_modules/node-llama-cpp/package.json',
    ],
    unpackedFiles: [
      'node_modules/node-llama-cpp/bins/addon.node',
      'node_modules/@node-llama-cpp/mac-arm64-metal/bin/libllama.dylib',
    ],
    platform: 'darwin',
    arch: 'arm64',
    prebuilds: [
      {
        name: 'mac-arm64-metal',
        files: ['bin/libllama.dylib'],
      },
    ],
    workerSource: "getLlama({ build: 'never' })",
  };

  it('accepts a complete target-compatible package', () => {
    expect(llamaPackageChecks(valid)).toEqual([
      { name: 'the archive listing is not empty', ok: true },
      { name: 'the unpacked listing is not empty', ok: true },
      { name: 'the llama worker bundle is packed', ok: true },
      { name: 'node-llama-cpp is packed', ok: true },
      { name: 'the llama.cpp addon is unpacked', ok: true },
      { name: 'the dependency installs llama.cpp prebuild packages', ok: true },
      { name: 'the plan keeps a llama.cpp prebuild package for this target', ok: true },
      { name: 'the shipped prebuilds carry llama.cpp shared libraries', ok: true },
      { name: 'mac-arm64-metal/bin/libllama.dylib is unpacked', ok: true },
      { name: 'the package carries the @node-llama-cpp scope', ok: true },
      { name: 'all 1 scope entries belong to a shipped package', ok: true },
      {
        name: 'node_modules/node-llama-cpp/llama/gitRelease.bundle is not packaged',
        ok: true,
      },
      { name: 'the built worker asks getLlama for build: never', ok: true },
    ]);
  });

  it('normalizes package listings and prebuild files', () => {
    expect(
      failures(
        llamaPackageChecks({
          ...valid,
          packedFiles: [
            '/.vite/build/llama-worker.js',
            String.raw`node_modules\node-llama-cpp\package.json`,
          ],
          unpackedFiles: [
            String.raw`node_modules\node-llama-cpp\.node`,
            String.raw`node_modules\@node-llama-cpp\mac-arm64-metal\bin\libllama.dylib`,
          ],
          prebuilds: [
            {
              name: 'mac-arm64-metal',
              files: [String.raw`bin\libllama.dylib`, 'README'],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('fails closed when package listings and prebuilds are absent', () => {
    const checks = llamaPackageChecks({
      ...valid,
      packedFiles: [],
      unpackedFiles: [],
      prebuilds: [],
      workerSource: '',
    });

    expect(failures(checks)).toEqual([
      'the archive listing is not empty',
      'the unpacked listing is not empty',
      'the llama worker bundle is packed',
      'node-llama-cpp is packed',
      'the llama.cpp addon is unpacked',
      'the dependency installs llama.cpp prebuild packages',
      'the plan keeps a llama.cpp prebuild package for this target',
      'the shipped prebuilds carry llama.cpp shared libraries',
      'the package carries the @node-llama-cpp scope',
      'all 0 scope entries belong to a shipped package',
      'the built worker asks getLlama for build: never',
    ]);
  });

  it('does not infer required files from unrelated archive entries', () => {
    const checks = llamaPackageChecks({
      ...valid,
      packedFiles: ['unrelated/package.json'],
      unpackedFiles: [
        'node_modules/other/addon.node',
        'node_modules/node-llama-cpp/package.json',
        'node_modules/node-llama-cpp/addon.node/README',
      ],
      prebuilds: [],
    });

    expect(failures(checks)).toContain('node-llama-cpp is packed');
    expect(failures(checks)).toContain('the llama.cpp addon is unpacked');
  });

  it('rejects foreign prebuilds and compile-only source', () => {
    const checks = llamaPackageChecks({
      ...valid,
      packedFiles: [
        ...valid.packedFiles,
        'node_modules/node-llama-cpp/llama/gitRelease.bundle',
      ],
      unpackedFiles: [
        ...valid.unpackedFiles,
        'node_modules/@node-llama-cpp/win-x64/bin/llama.dll',
      ],
      prebuilds: [
        ...valid.prebuilds,
        { name: 'win-x64', files: ['bin/llama.dll'] },
      ],
      workerSource: 'getLlama({ build: mode })',
    });

    expect(failures(checks)).toContain(
      '1 scope entries belong to a dropped package, first node_modules/@node-llama-cpp/win-x64/bin/llama.dll',
    );
    expect(failures(checks)).toContain(
      'node_modules/node-llama-cpp/llama/gitRelease.bundle is not packaged',
    );
    expect(failures(checks)).toContain(
      'the built worker asks getLlama for build: never',
    );
    expect(checks).not.toContainEqual({
      name: 'win-x64/bin/llama.dll is unpacked',
      ok: true,
    });
  });

  it('checks each enabled backend library and exact worker syntax', () => {
    const checks = llamaPackageChecks({
      ...valid,
      unpackedFiles: [
        ...valid.unpackedFiles,
        'node_modules/@node-llama-cpp/mac-arm64-vulkan/bin/libllama.so',
      ],
      prebuilds: [
        ...valid.prebuilds,
        { name: 'mac-arm64-vulkan', files: ['bin/libllama.so'] },
      ],
      backends: ['vulkan'],
      workerSource: "getLlama({ build:'never' })",
    });

    expect(failures(checks)).toEqual([]);
    expect(checks).toContainEqual({
      name: 'mac-arm64-vulkan/bin/libllama.so is unpacked',
      ok: true,
    });
    expect(
      failures(llamaPackageChecks({ ...valid, workerSource: "getLlama({ build : 'never' })" })),
    ).toEqual([]);
  });
});
