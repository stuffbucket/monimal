import { describe, expect, it, vi } from 'vitest';

import { ShutdownLifecycle, type ShutdownSnapshot } from '../src/host/shutdown-lifecycle.js';

describe('ShutdownLifecycle', () => {
  it('stops before commitment when a participant vetoes', async () => {
    const lifecycle = new ShutdownLifecycle();
    const joined = vi.fn();
    lifecycle.onBeforeShutdown((event) => {
      event.veto(true, { id: 'editor', label: 'Unsaved editor' });
    });
    lifecycle.onWillShutdown(joined);

    await expect(lifecycle.request('quit')).resolves.toBe('vetoed');
    expect(joined).not.toHaveBeenCalled();
    expect(lifecycle.snapshot()).toMatchObject({ phase: 'vetoed', reason: 'quit' });
  });

  it('allows a new shutdown request after a veto clears', async () => {
    const lifecycle = new ShutdownLifecycle();
    const joined = vi.fn();
    let blocked = true;
    lifecycle.onBeforeShutdown((event) => {
      event.veto(blocked, { id: 'editor', label: 'Unsaved editor' });
    });
    lifecycle.onWillShutdown(joined);

    await expect(lifecycle.request('quit')).resolves.toBe('vetoed');
    blocked = false;
    await expect(lifecycle.request('quit')).resolves.toBe('completed');

    expect(joined).toHaveBeenCalledOnce();
    expect(lifecycle.snapshot().phase).toBe('did');
  });

  it('treats a rejected veto as a veto and exposes the failure', async () => {
    const lifecycle = new ShutdownLifecycle();
    lifecycle.onBeforeShutdown((event) => {
      event.veto(Promise.reject(new Error('Save check failed.')), {
        id: 'editor',
        label: 'Unsaved editor',
      });
    });

    await expect(lifecycle.request('close')).resolves.toBe('vetoed');
    expect(lifecycle.snapshot().operations).toEqual([{
      id: 'editor',
      label: 'Unsaved editor',
      phase: 'failed',
      detail: 'Save check failed.',
    }]);
  });

  it('waits for default joiners before invoking last joiners', async () => {
    const lifecycle = new ShutdownLifecycle();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    lifecycle.onWillShutdown((event) => {
      event.join(pending.then(() => { order.push('default'); }), {
        id: 'core',
        label: 'Core',
      });
      event.join(async () => { order.push('last'); }, {
        id: 'logs',
        label: 'Logs',
        order: 'last',
      });
    });

    const result = lifecycle.request('quit');
    await Promise.resolve();
    expect(order).toEqual([]);
    release();

    await expect(result).resolves.toBe('completed');
    expect(order).toEqual(['default', 'last']);
    expect(lifecycle.snapshot().phase).toBe('did');
  });

  it('publishes named joiner progress and completion', async () => {
    const lifecycle = new ShutdownLifecycle();
    const snapshots: ShutdownSnapshot[] = [];
    lifecycle.subscribe((snapshot) => snapshots.push(snapshot));
    lifecycle.onWillShutdown((event) => {
      event.join((async () => {
        event.report('core', 'Waiting for process exit.');
      })(), { id: 'core', label: 'Core' });
    });

    await lifecycle.request('reload');

    expect(snapshots.some(({ operations }) =>
      operations[0]?.detail === 'Waiting for process exit.',
    )).toBe(true);
    expect(lifecycle.snapshot().operations[0]?.phase).toBe('complete');
  });

  it('only forces a committed shutdown and signals its joiners', async () => {
    const lifecycle = new ShutdownLifecycle();
    let signal: AbortSignal | undefined;
    lifecycle.onWillShutdown((event) => {
      signal = event.signal;
      event.join(new Promise<void>(() => undefined), { id: 'core', label: 'Core' });
    });

    expect(lifecycle.force()).toBe(false);
    const result = lifecycle.request('quit');
    await Promise.resolve();
    expect(lifecycle.force()).toBe(true);

    await expect(result).resolves.toBe('forced');
    expect(signal?.aborted).toBe(true);
    expect(lifecycle.snapshot().phase).toBe('forced');
  });

  it('does not treat elapsed time as joiner completion', async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = new ShutdownLifecycle();
      lifecycle.onWillShutdown((event) => {
        event.join(new Promise<void>(() => undefined), {
          id: 'plugin',
          label: 'Slow plugin',
        });
      });
      let settled = false;
      const result = lifecycle.request('quit').then((value) => {
        settled = true;
        return value;
      });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(settled).toBe(false);
      expect(lifecycle.snapshot().phase).toBe('will');
      expect(lifecycle.force()).toBe(true);
      await expect(result).resolves.toBe('forced');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one in-flight request across repeated quit signals', async () => {
    const lifecycle = new ShutdownLifecycle();
    let release: () => void = () => undefined;
    lifecycle.onWillShutdown((event) => {
      event.join(new Promise<void>((resolve) => {
        release = resolve;
      }), { id: 'core', label: 'Core' });
    });

    const first = lifecycle.request('quit');
    const second = lifecycle.request('reload');
    expect(second).toBe(first);
    await Promise.resolve();
    release();
    await expect(first).resolves.toBe('completed');
  });
});
