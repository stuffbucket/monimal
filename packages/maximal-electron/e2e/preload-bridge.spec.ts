import { expect, test } from '@playwright/test';

import { closeApp, launchApp, type Harness } from './harness.js';

/**
 * The exported preload bridge, in the real application.
 *
 * Issue #17 asks for a bridge that works under `sandbox: true`. That is a
 * constraint on the preload, not a feature of it, so it is asserted against a
 * running window rather than reasoned about: `additionalArguments` has to
 * reach `process.argv` in a sandboxed preload for the declaration to arrive at
 * all, and nothing in the unit suite can answer that.
 *
 * `src/preload/index.ts` builds this shell's own bridge with the same
 * `exposeBridge` a consumer imports, so what these assertions cover is the
 * exported seam and not a second copy of it.
 */

let harness: Harness;

interface BridgeShape {
  capabilities: string[];
  serviceOrigin: string | null;
  methods: string[];
  invoke: boolean;
}

test.beforeAll(async () => {
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

async function readBridge(): Promise<BridgeShape> {
  // `window` is the Playwright page in this file, so the bridge is reached
  // through `globalThis`.
  return harness.window.evaluate(() => {
    const api = (
      globalThis as unknown as { stuffbucket?: Record<string, unknown> }
    ).stuffbucket;
    if (api === undefined) throw new Error('No bridge on the page. The preload did not run.');
    return {
      capabilities: [...((api['capabilities'] as string[] | undefined) ?? [])],
      serviceOrigin: (api['serviceOrigin'] as string | null) ?? null,
      methods: Object.keys(api).filter((key) => typeof api[key] === 'function'),
      invoke: typeof api['invoke'] === 'function',
    };
  });
}

test('the window that carries the bridge is sandboxed', async () => {
  const preferences = await harness.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window === undefined) return null;
    // Typed loosely: `getLastWebPreferences` is on `WebContents` at run time
    // and missing from this Electron release's declarations.
    const contents = window.webContents as unknown as {
      getLastWebPreferences: () => Record<string, unknown> | null;
    };
    return contents.getLastWebPreferences();
  });

  expect(preferences).not.toBeNull();
  expect(preferences?.['sandbox']).toBe(true);
  expect(preferences?.['contextIsolation']).toBe(true);
  expect(preferences?.['nodeIntegration']).toBeFalsy();
});

test('the declaration reaches a sandboxed preload', async () => {
  const bridge = await readBridge();

  // The floor. An empty list would satisfy every claim below by carrying
  // nothing, and it is exactly what a declaration that never arrived produces.
  expect(bridge.capabilities.length).toBeGreaterThan(0);
  expect(bridge.capabilities).toEqual(['openExternal', 'versions']);
});

test('an undeclared capability has no method at all', async () => {
  const bridge = await readBridge();

  expect(bridge.methods).toContain('openExternal');
  expect(bridge.methods).toContain('versions');
  // This build has no update channel, so `mainWindowOptions` does not declare
  // `checkForUpdate`. Absent, rather than present and answering `unsupported`,
  // is the whole of feature detection.
  expect(bridge.methods).not.toContain('checkForUpdate');
});

test('the host adds its own channels under the same namespace', async () => {
  // `extend`. `contextBridge` allows one call per key, so this shell's twenty
  // private channels ride on the object the exported bridge produced.
  expect((await readBridge()).invoke).toBe(true);
});

test('a declared capability answers in an ok envelope', async () => {
  const result = await harness.window.evaluate(async () => {
    const api = (globalThis as unknown as { stuffbucket: Record<string, unknown> }).stuffbucket;
    const versions = api['versions'] as () => Promise<{ ok: boolean; value?: { app?: string } }>;
    return versions();
  });

  expect(result.ok).toBe(true);
  expect(typeof result.value?.app).toBe('string');
});

test('a call the host refuses resolves rather than rejecting', async () => {
  // `file:` is outside the `shell:open-external` allow-list, so the handler
  // throws. The bridge turns that into a value; nothing rejects.
  const result = await harness.window.evaluate(async () => {
    const api = (globalThis as unknown as { stuffbucket: Record<string, unknown> }).stuffbucket;
    const openExternal = api['openExternal'] as (
      url: string,
    ) => Promise<{ ok: boolean; code?: string; message?: string }>;
    return openExternal('file:///etc/passwd');
  });

  expect(result.ok).toBe(false);
  expect(result.code).toBe('refused');
  expect(result.message).toContain('file:///etc/passwd');
});

test('a malformed call is refused before it leaves the renderer', async () => {
  const result = await harness.window.evaluate(async () => {
    const api = (globalThis as unknown as { stuffbucket: Record<string, unknown> }).stuffbucket;
    const openExternal = api['openExternal'] as (
      url: string,
    ) => Promise<{ ok: boolean; code?: string }>;
    return openExternal('');
  });

  expect(result.ok).toBe(false);
  expect(result.code).toBe('failed');
});

test('no origin is injected when the host declares none', async () => {
  // This shell has no service to discover. `runMain` resolves
  // `discoverDaemonUrl` for a consumer that does, and `serviceOrigin` is where
  // the result lands.
  expect((await readBridge()).serviceOrigin).toBeNull();
});
