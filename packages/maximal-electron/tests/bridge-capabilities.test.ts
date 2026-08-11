import { describe, expect, it, vi } from 'vitest';

import {
  BRIDGE_CAPABILITIES,
  CAPABILITY_ARGUMENT,
  CAPABILITY_CHANNELS,
  ORIGIN_ARGUMENT,
  buildBridge,
  capabilityArguments,
  classify,
  declaredCapabilities,
  declaredOrigin,
  normalizeOrigin,
  type BridgeTransport,
} from '../src/preload/capabilities.js';
import { IPC_CHANNELS } from '../src/shared/ipc.js';

/**
 * The bridge a consumer bundles into their own preload.
 *
 * `src/preload/capabilities.ts` imports no `electron`, which is what puts the
 * whole shape under Stryker. The transport is injected here for the same
 * reason `runMain` takes `app`.
 */

function transport(result: Promise<unknown>) {
  const invoke = vi.fn(() => result);
  return { invoke, spy: invoke } as unknown as BridgeTransport & {
    spy: ReturnType<typeof vi.fn>;
  };
}

describe('the capability set', () => {
  it('names a channel for every capability', () => {
    // The floor. An empty set would satisfy every claim below by holding
    // nothing, and this whole module is a map with three entries in it.
    expect(BRIDGE_CAPABILITIES.length).toBeGreaterThan(0);
    expect(Object.keys(CAPABILITY_CHANNELS).sort()).toEqual([...BRIDGE_CAPABILITIES].sort());
    expect(BRIDGE_CAPABILITIES).toEqual(['openExternal', 'versions', 'checkForUpdate']);
  });

  it('pins the channel each capability calls', () => {
    // The literals are duplicated rather than imported, so this is the pin
    // that stops the copy moving on its own.
    expect(CAPABILITY_CHANNELS).toEqual({
      openExternal: 'shell:open-external',
      versions: 'app:versions',
      checkForUpdate: 'update:check',
    });
  });

  /**
   * The check the duplication owes.
   *
   * Issue #17 asks for the channel literals in the preload rather than
   * imported from `src/shared/ipc.ts`, because importing the contract puts
   * this application on the export graph and `npm run verify:neutral` fails.
   * Two copies with nothing comparing them is how they drift, so this compares
   * them from the one place that may see both: a test.
   */
  it('names only channels this shell answers', () => {
    const declared = Object.values(CAPABILITY_CHANNELS);
    expect(declared.length).toBe(BRIDGE_CAPABILITIES.length);
    expect(declared.filter((channel) => !IPC_CHANNELS.includes(channel as never))).toEqual([]);
  });

  it('namespaces every channel', () => {
    for (const channel of Object.values(CAPABILITY_CHANNELS)) expect(channel).toContain(':');
  });
});

describe('normalizeOrigin', () => {
  it('drops one trailing slash and keeps a path', () => {
    expect(normalizeOrigin('http://127.0.0.1:9731/')).toBe('http://127.0.0.1:9731');
    expect(normalizeOrigin('https://example.test/control')).toBe(
      'https://example.test/control',
    );
  });

  it('accepts both web schemes and nothing else', () => {
    expect(normalizeOrigin('http://example.test')).toBe('http://example.test');
    expect(normalizeOrigin('https://example.test')).toBe('https://example.test');
    // `file:` would make an injected origin an arbitrary local read.
    expect(normalizeOrigin('file:///etc/passwd')).toBeNull();
    expect(normalizeOrigin('ws://example.test')).toBeNull();
  });

  it('returns null for anything that is not an absolute URL', () => {
    expect(normalizeOrigin('/control')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });

  it('is idempotent, so the host and the preload agree', () => {
    const once = normalizeOrigin('http://example.test/');
    expect(once).not.toBeNull();
    expect(normalizeOrigin(once as string)).toBe(once);
  });
});

describe('capabilityArguments', () => {
  it('produces nothing without a declaration', () => {
    expect(capabilityArguments(undefined)).toEqual([]);
    expect(capabilityArguments({})).toEqual([]);
  });

  it('writes one argument per capability, deduplicated', () => {
    expect(capabilityArguments({ capabilities: ['versions', 'versions', 'openExternal'] })).toEqual(
      [`${CAPABILITY_ARGUMENT}versions`, `${CAPABILITY_ARGUMENT}openExternal`],
    );
  });

  it('appends the normalized origin', () => {
    expect(
      capabilityArguments({ capabilities: ['versions'], serviceOrigin: 'http://127.0.0.1:9731/' }),
    ).toEqual([`${CAPABILITY_ARGUMENT}versions`, `${ORIGIN_ARGUMENT}http://127.0.0.1:9731`]);
  });

  it('refuses a capability this bridge does not carry', () => {
    // Dropping it would leave a window whose bridge is silently short a
    // method, which is the failure this seam exists to make visible.
    expect(() => capabilityArguments({ capabilities: ['openTerminal' as never] })).toThrow(
      'openTerminal is not a bridge capability. ' +
        'The set is openExternal, versions, checkForUpdate.',
    );
    expect(() => capabilityArguments({ capabilities: ['versions'] })).not.toThrow();
  });

  it('refuses an origin that is not an absolute web URL', () => {
    expect(() => capabilityArguments({ serviceOrigin: 'localhost:9731' })).toThrow(
      /serviceOrigin must be an absolute http or https URL, and was "localhost:9731"/,
    );
  });
});

describe('declaredCapabilities', () => {
  it('reads what the host declared, in this bridge order', () => {
    expect(
      declaredCapabilities([
        `${CAPABILITY_ARGUMENT}versions`,
        `${CAPABILITY_ARGUMENT}openExternal`,
      ]),
    ).toEqual(['openExternal', 'versions']);
  });

  it('returns one name per declaration and no more', () => {
    expect(declaredCapabilities([`${CAPABILITY_ARGUMENT}versions`])).toEqual(['versions']);
    expect(declaredCapabilities([])).toEqual([]);
  });

  it('drops a name this build does not know', () => {
    // An older bridge against a newer host loses a method rather than gaining
    // a broken one.
    expect(declaredCapabilities([`${CAPABILITY_ARGUMENT}teleport`])).toEqual([]);
  });

  it('requires the flag, not a tail that happens to match', () => {
    const disguised = `${'x'.repeat(CAPABILITY_ARGUMENT.length)}versions`;
    expect(declaredCapabilities([disguised, '--inspect', `${ORIGIN_ARGUMENT}http://a.test`])).toEqual(
      [],
    );
  });
});

describe('declaredOrigin', () => {
  it('reads and normalizes the injected origin', () => {
    expect(declaredOrigin([`${ORIGIN_ARGUMENT}http://127.0.0.1:9731/`])).toBe(
      'http://127.0.0.1:9731',
    );
  });

  it('is null when the host injected none', () => {
    expect(declaredOrigin([])).toBeNull();
    expect(declaredOrigin(['--inspect'])).toBeNull();
  });

  it('takes the last one, so a later argument overrides an earlier', () => {
    expect(
      declaredOrigin([
        `${ORIGIN_ARGUMENT}http://first.test`,
        `${ORIGIN_ARGUMENT}http://second.test`,
      ]),
    ).toBe('http://second.test');
  });

  it('requires the flag, not a tail that happens to match', () => {
    const disguised = `${'y'.repeat(ORIGIN_ARGUMENT.length)}http://a.test`;
    expect(declaredOrigin([disguised])).toBeNull();
  });

  it('is null for an origin the host should never have injected', () => {
    expect(declaredOrigin([`${ORIGIN_ARGUMENT}file:///etc/passwd`])).toBeNull();
  });

  it('does not fall back to an earlier origin when the last one is malformed', () => {
    expect(
      declaredOrigin([`${ORIGIN_ARGUMENT}http://first.test`, `${ORIGIN_ARGUMENT}nonsense`]),
    ).toBeNull();
  });
});

describe('classify', () => {
  it('calls a channel with no handler unavailable', () => {
    // Electron's own wording for an unregistered channel. That is the fact a
    // host declaring a capability it did not implement produces.
    expect(classify(new Error("No handler registered for 'app:versions'"))).toEqual({
      ok: false,
      code: 'unavailable',
      message: "No handler registered for 'app:versions'",
    });
  });

  it('calls a handler that threw refused', () => {
    expect(classify(new Error('Refused to open unsafe URL: file:///etc/passwd'))).toEqual({
      ok: false,
      code: 'refused',
      message: 'Refused to open unsafe URL: file:///etc/passwd',
    });
  });

  it('reads a rejection that is not an Error', () => {
    expect(classify('plain string')).toEqual({
      ok: false,
      code: 'refused',
      message: 'plain string',
    });
  });
});

describe('buildBridge', () => {
  const declared = [
    `${CAPABILITY_ARGUMENT}openExternal`,
    `${CAPABILITY_ARGUMENT}versions`,
    `${ORIGIN_ARGUMENT}http://127.0.0.1:9731`,
  ];

  it('defines a method for each declared capability and none for the rest', () => {
    const bridge = buildBridge(transport(Promise.resolve(undefined)), declared);

    expect(bridge.capabilities).toEqual(['openExternal', 'versions']);
    expect(typeof bridge.openExternal).toBe('function');
    expect(typeof bridge.versions).toBe('function');
    // The whole feature test. An undeclared capability is absent, not present
    // and failing.
    expect(bridge.checkForUpdate).toBeUndefined();
  });

  it('carries the injected origin as a value', () => {
    expect(buildBridge(transport(Promise.resolve(undefined)), declared).serviceOrigin).toBe(
      'http://127.0.0.1:9731',
    );
    expect(buildBridge(transport(Promise.resolve(undefined)), []).serviceOrigin).toBeNull();
  });

  it('wraps a resolved value in an ok envelope', async () => {
    const wire = transport(Promise.resolve({ app: '0.0.4' }));
    const bridge = buildBridge(wire, [`${CAPABILITY_ARGUMENT}versions`]);

    await expect(bridge.versions?.()).resolves.toEqual({ ok: true, value: { app: '0.0.4' } });
    expect(wire.spy).toHaveBeenCalledWith('app:versions');
  });

  it('sends openExternal its url as a request object', async () => {
    const wire = transport(Promise.resolve(undefined));
    const bridge = buildBridge(wire, [`${CAPABILITY_ARGUMENT}openExternal`]);

    await expect(bridge.openExternal?.('https://example.test')).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(wire.spy).toHaveBeenCalledWith('shell:open-external', {
      url: 'https://example.test',
    });
  });

  it('calls the channel each capability names', async () => {
    const wire = transport(Promise.resolve('answered'));
    const bridge = buildBridge(wire, [`${CAPABILITY_ARGUMENT}checkForUpdate`]);

    await expect(bridge.checkForUpdate?.()).resolves.toEqual({ ok: true, value: 'answered' });
    expect(wire.spy).toHaveBeenCalledWith('update:check');
  });

  it('never rejects, whatever the transport does', async () => {
    const wire = transport(Promise.reject(new Error("No handler registered for 'app:versions'")));
    const bridge = buildBridge(wire, [`${CAPABILITY_ARGUMENT}versions`]);

    await expect(bridge.versions?.()).resolves.toEqual({
      ok: false,
      code: 'unavailable',
      message: "No handler registered for 'app:versions'",
    });
  });

  it('refuses a url that is not a non-empty string before the call leaves', async () => {
    const wire = transport(Promise.resolve(undefined));
    const bridge = buildBridge(wire, [`${CAPABILITY_ARGUMENT}openExternal`]);

    for (const bad of ['', undefined, 7]) {
      await expect(bridge.openExternal?.(bad as unknown as string)).resolves.toEqual({
        ok: false,
        code: 'failed',
        message: 'openExternal needs a non-empty URL string.',
      });
    }
    expect(wire.spy).not.toHaveBeenCalled();
  });

  it('leaves the capability list frozen', () => {
    const bridge = buildBridge(transport(Promise.resolve(undefined)), declared);
    expect(Object.isFrozen(bridge.capabilities)).toBe(true);
  });
});
