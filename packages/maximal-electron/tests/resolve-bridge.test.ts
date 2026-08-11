import { describe, expect, it, vi } from 'vitest';

import { resolveBridge } from '../src/renderer/lib/resolve-bridge.js';

/**
 * Whether the renderer can load without a preload.
 *
 * It could not. `bridge.ts` read `window.stuffbucket` at module scope and
 * handed it straight out, so every component importing it threw on import,
 * before rendering anything. Storybook made that concrete: the stub has to go
 * in `preview-head.html` as a classic script, ahead of the module graph.
 *
 * These tests pin the shape of the stand-in as hard as the detection, because
 * a stand-in that resolves undefined is worse than no stand-in — a caller
 * expecting preferences renders something wrong and says nothing.
 */

describe('resolveBridge', () => {
  it('takes an object with invoke and on as the real thing', () => {
    const api = { invoke: vi.fn(), on: vi.fn() };
    const resolved = resolveBridge(api);
    expect(resolved.present).toBe(true);
    expect(resolved.bridge).toBe(api);
  });

  it('is absent when nothing is there', () => {
    expect(resolveBridge(undefined).present).toBe(false);
    expect(resolveBridge(null).present).toBe(false);
  });

  it('is absent for a value of the wrong kind', () => {
    // `window.stuffbucket` is whatever the page put there. A string or a
    // number is not a bridge, and treating one as such fails later and
    // further away than here.
    expect(resolveBridge('stuffbucket').present).toBe(false);
    expect(resolveBridge(42).present).toBe(false);
    expect(resolveBridge(() => undefined).present).toBe(false);
  });

  it('needs both halves, not either', () => {
    expect(resolveBridge({ invoke: vi.fn() }).present).toBe(false);
    expect(resolveBridge({ on: vi.fn() }).present).toBe(false);
    expect(resolveBridge({ invoke: 'no', on: vi.fn() }).present).toBe(false);
    expect(resolveBridge({ invoke: vi.fn(), on: 'no' }).present).toBe(false);
  });

  describe('the stand-in', () => {
    it('rejects rather than resolving undefined', async () => {
      const { bridge } = resolveBridge(undefined);
      await expect(bridge.invoke('prefs:get')).rejects.toThrow(
        /no preload bridge/i,
      );
    });

    it('names why, so the failure is not a mystery', async () => {
      const { bridge } = resolveBridge(undefined);
      // The whole message, not a fragment. Half of it was unasserted and a
      // mutant that emptied that half survived.
      await expect(bridge.invoke('prefs:get')).rejects.toThrow(
        'No preload bridge on this page. The renderer is running outside its ' +
          'host, so anything needing the main process is unavailable.',
      );
    });

    it('returns a working unsubscribe from on', () => {
      const { bridge } = resolveBridge(undefined);
      const off = bridge.on('prefs:changed', () => undefined);
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
    });

    it('never calls the listener, because no event can arrive', () => {
      const { bridge } = resolveBridge(undefined);
      const listener = vi.fn();
      bridge.on('prefs:changed', listener);
      expect(listener).not.toHaveBeenCalled();
    });

    it('is a fresh object each time, so one caller cannot poison another', () => {
      expect(resolveBridge(undefined).bridge).not.toBe(
        resolveBridge(undefined).bridge,
      );
    });
  });
});
