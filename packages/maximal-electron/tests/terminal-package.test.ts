import { describe, expect, it } from 'vitest';

import {
  contentSecurityPolicyChecks,
  terminalNativeFiles,
  terminalPackageChecks,
  terminalPrebuildDirectory,
  type TerminalPackageCheck,
} from '../scripts/terminal-package.mjs';

/**
 * The checks a consumer runs against their own build.
 *
 * The failure this repository keeps producing is not a wrong rule, it is a
 * right rule over an empty scope: point a check at the wrong directory and it
 * reports every assertion as a pass. So the floors are pinned here as hard as
 * the assertions, and each fixture is deliberately small enough that an empty
 * one is visible.
 */

const failed = (checks: TerminalPackageCheck[]) =>
  checks.filter((entry) => !entry.ok).map((entry) => entry.name);

const packedDarwin = [
  '/.vite/build/main.js',
  '/node_modules/node-pty/lib/index.js',
  '/node_modules/node-pty/prebuilds/darwin-arm64/pty.node',
  '/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
];

const unpackedDarwin = [
  'node_modules/node-pty/prebuilds/darwin-arm64/pty.node',
  'node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
];

/** Shaped like the one `src/renderer/index.html` declares. */
const shippedPolicy = "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data:";

const darwin = {
  packedFiles: packedDarwin,
  unpackedFiles: unpackedDarwin,
  platform: 'darwin',
  arch: 'arm64',
  contentSecurityPolicy: shippedPolicy,
};

describe('terminalPrebuildDirectory', () => {
  it('joins the platform and the architecture', () => {
    expect(terminalPrebuildDirectory('linux', 'x64')).toBe('linux-x64');
    expect(terminalPrebuildDirectory('win32', 'arm64')).toBe('win32-arm64');
  });

  it('treats a mas build as darwin, because node-pty has no mas prebuild', () => {
    expect(terminalPrebuildDirectory('mas', 'arm64')).toBe('darwin-arm64');
  });
});

describe('terminalNativeFiles', () => {
  it('names spawn-helper on macOS, where pty.cc execs it', () => {
    expect(terminalNativeFiles('darwin')).toEqual(['pty.node', 'spawn-helper']);
    expect(terminalNativeFiles('mas')).toEqual(['pty.node', 'spawn-helper']);
  });

  it('omits spawn-helper on linux, which forkpty does not need', () => {
    expect(terminalNativeFiles('linux')).toEqual(['pty.node']);
  });

  it('names the conpty set on Windows', () => {
    expect(terminalNativeFiles('win32')).toEqual([
      'conpty.node',
      'conpty_console_list.node',
      'conpty/conpty.dll',
      'conpty/OpenConsole.exe',
    ]);
  });
});

describe('contentSecurityPolicyChecks', () => {
  it('passes a policy that grants both sources', () => {
    const policy = "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data:";
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual([]);
  });

  it('reports a missing wasm-unsafe-eval', () => {
    const policy = "script-src 'self'; connect-src data:";
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual([
      "script-src grants 'wasm-unsafe-eval'",
    ]);
  });

  it('reports a missing data: source', () => {
    const policy = "script-src 'wasm-unsafe-eval'; connect-src 'self'";
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual(['connect-src grants data:']);
  });

  it('reads a directive that is not the first one', () => {
    const policy = "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src data:";
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual([]);
  });

  it('falls back to default-src, as the policy itself does', () => {
    const policy = "default-src 'wasm-unsafe-eval' data:";
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual([]);
  });

  it('prefers a present directive over default-src', () => {
    const policy = "default-src 'wasm-unsafe-eval' data:; connect-src 'self'";
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual(['connect-src grants data:']);
  });

  it('reports both when the policy grants neither', () => {
    expect(failed(contentSecurityPolicyChecks("default-src 'self'"))).toEqual([
      "script-src grants 'wasm-unsafe-eval'",
      'connect-src grants data:',
    ]);
  });

  it('reports an empty policy rather than passing it', () => {
    expect(failed(contentSecurityPolicyChecks('')).length).toBe(2);
  });

  it('does not accept an unquoted wasm-unsafe-eval, which grants nothing', () => {
    const policy = 'script-src wasm-unsafe-eval; connect-src data:';
    expect(failed(contentSecurityPolicyChecks(policy))).toEqual([
      "script-src grants 'wasm-unsafe-eval'",
    ]);
  });
});

describe('terminalPackageChecks', () => {
  it('passes a correctly packaged darwin build', () => {
    expect(failed(terminalPackageChecks(darwin))).toEqual([]);
  });

  it('fails on an empty archive listing rather than passing over nothing', () => {
    const checks = terminalPackageChecks({ ...darwin, packedFiles: [] });
    expect(failed(checks)).toContain('the archive listing is not empty');
  });

  it('fails on an empty unpacked listing rather than passing over nothing', () => {
    const checks = terminalPackageChecks({ ...darwin, unpackedFiles: [] });
    expect(failed(checks)).toContain('the unpacked listing is not empty');
  });

  it('fails every assertion when nothing is supplied', () => {
    const checks = terminalPackageChecks({
      platform: 'darwin',
      arch: 'arm64',
      packedFiles: [],
      unpackedFiles: [],
    });
    expect(failed(checks)).toEqual(checks.map((entry) => entry.name));
  });

  it('reports a bundled node-pty, which packs no files at all', () => {
    const checks = terminalPackageChecks({
      ...darwin,
      packedFiles: ['/.vite/build/main.js'],
    });
    expect(failed(checks)).toContain('node-pty is packed as real files');
  });

  it('reports spawn-helper left inside the archive', () => {
    const checks = terminalPackageChecks({
      ...darwin,
      unpackedFiles: ['node_modules/node-pty/prebuilds/darwin-arm64/pty.node'],
    });
    expect(failed(checks)).toEqual(['spawn-helper is unpacked']);
  });

  it('reports a prebuild for another platform', () => {
    const checks = terminalPackageChecks({
      ...darwin,
      packedFiles: [...packedDarwin, '/node_modules/node-pty/prebuilds/win32-x64/conpty.node'],
    });
    expect(failed(checks)).toEqual(['only the darwin-arm64 prebuild is present']);
  });

  it('reports a prebuild for another architecture of the same platform', () => {
    const checks = terminalPackageChecks({
      ...darwin,
      packedFiles: [...packedDarwin, '/node_modules/node-pty/prebuilds/darwin-x64/pty.node'],
    });
    expect(failed(checks)).toEqual(['only the darwin-arm64 prebuild is present']);
  });

  it('fails when no prebuild directory appears anywhere', () => {
    const checks = terminalPackageChecks({
      ...darwin,
      packedFiles: ['/node_modules/node-pty/lib/index.js'],
      unpackedFiles: ['node_modules/node-llama-cpp/llama.node'],
    });
    expect(failed(checks)).toContain('a prebuild directory is present');
    expect(failed(checks)).toContain('only the darwin-arm64 prebuild is present');
  });

  it('reports a prebuild directory named at the root of a relative path', () => {
    const checks = terminalPackageChecks({
      platform: 'darwin',
      arch: 'arm64',
      contentSecurityPolicy: shippedPolicy,
      packedFiles: ['node-pty/lib/index.js'],
      unpackedFiles: ['prebuilds/darwin-arm64/pty.node', 'prebuilds/darwin-arm64/spawn-helper'],
    });
    expect(failed(checks)).toEqual([]);
  });

  it('accepts a package whose only node-pty path carries a platform suffix', () => {
    const prebuild = 'node_modules/@lydell/node-pty-darwin-arm64/prebuilds/darwin-arm64';
    const checks = terminalPackageChecks({
      platform: 'darwin',
      arch: 'arm64',
      contentSecurityPolicy: shippedPolicy,
      packedFiles: ['/node_modules/@lydell/node-pty-darwin-arm64/lib/index.js'],
      unpackedFiles: [`${prebuild}/pty.node`, `${prebuild}/spawn-helper`],
    });
    expect(failed(checks)).toEqual([]);
  });

  it('accepts the @lydell layout, where the prebuild sits in another package', () => {
    const checks = terminalPackageChecks({
      platform: 'darwin',
      arch: 'arm64',
      contentSecurityPolicy: shippedPolicy,
      packedFiles: [
        '/node_modules/@lydell/node-pty/index.js',
        '/node_modules/@lydell/node-pty-darwin-arm64/lib/index.js',
      ],
      unpackedFiles: [
        'node_modules/@lydell/node-pty-darwin-arm64/prebuilds/darwin-arm64/pty.node',
        'node_modules/@lydell/node-pty-darwin-arm64/prebuilds/darwin-arm64/spawn-helper',
      ],
    });
    expect(failed(checks)).toEqual([]);
  });

  it('accepts a linux build with no spawn-helper', () => {
    const prebuild = 'node_modules/node-pty/prebuilds/linux-x64';
    const checks = terminalPackageChecks({
      platform: 'linux',
      arch: 'x64',
      contentSecurityPolicy: shippedPolicy,
      packedFiles: ['/node_modules/node-pty/lib/index.js', `/${prebuild}/pty.node`],
      unpackedFiles: [`${prebuild}/pty.node`],
    });
    expect(failed(checks)).toEqual([]);
  });

  it('checks the conpty set on a windows build', () => {
    const prebuild = 'node_modules/node-pty/prebuilds/win32-x64';
    const checks = terminalPackageChecks({
      platform: 'win32',
      arch: 'x64',
      contentSecurityPolicy: shippedPolicy,
      packedFiles: ['/node_modules/node-pty/lib/index.js', `/${prebuild}/conpty.node`],
      unpackedFiles: [
        `${prebuild}/conpty.node`,
        `${prebuild}/conpty_console_list.node`,
        `${prebuild}/conpty/conpty.dll`,
      ],
    });
    expect(failed(checks)).toEqual(['conpty/OpenConsole.exe is unpacked']);
  });

  it('reports a missing content policy rather than dropping the two checks', () => {
    const { contentSecurityPolicy: _omitted, ...withoutPolicy } = darwin;
    expect(failed(terminalPackageChecks(withoutPolicy))).toEqual([
      'a renderer content policy was supplied',
      "script-src grants 'wasm-unsafe-eval'",
      'connect-src grants data:',
    ]);
  });

  it('reports an empty content policy as a missing one', () => {
    const checks = terminalPackageChecks({ ...darwin, contentSecurityPolicy: '' });
    expect(failed(checks)).toContain('a renderer content policy was supplied');
  });

  it('accepts a supplied policy without reporting it missing', () => {
    const checks = terminalPackageChecks({
      ...darwin,
      contentSecurityPolicy: "script-src 'self'; connect-src 'self'",
    });
    expect(failed(checks)).toEqual([
      "script-src grants 'wasm-unsafe-eval'",
      'connect-src grants data:',
    ]);
  });
});
