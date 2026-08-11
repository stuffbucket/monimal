import { useCallback, useEffect, useRef, useState } from 'react';

import { BRIDGE_KEY } from '../../shared/ipc.js';
import type {
  IpcEvent,
  IpcEventPayload,
  Preferences,
} from '../../shared/ipc.js';

import { resolveBridge } from './resolve-bridge.js';

/**
 * Typed access to the preload bridge.
 *
 * Everything the renderer knows about the main process goes through here, so
 * there is exactly one place to stub in a test or a browser preview.
 *
 * Feature-detected. Without a preload — a plain browser, a Storybook frame —
 * `bridge` is a stand-in that rejects, and `hasBridge` is false. Importing
 * this module never throws, which is the whole point: it used to, and it took
 * every component that touched it down on import rather than on use.
 */
const resolved = resolveBridge(
  (globalThis as Record<string, unknown>)[BRIDGE_KEY],
);

export const bridge = resolved.bridge;

/** False when the renderer is running outside its host. */
export const hasBridge = resolved.present;

/** Subscribe to a main-process event for the lifetime of a component. */
export function useBridgeEvent<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): void {
  // Keep the latest listener without resubscribing on every render.
  const ref = useRef(listener);
  ref.current = listener;

  useEffect(() => {
    return bridge.on(event, (payload) => ref.current(payload));
  }, [event]);
}

/** Read preferences once, then track any change from any source. */
export function usePreferences(): [
  Preferences | undefined,
  (patch: Partial<Preferences>) => void,
] {
  const [prefs, setPrefs] = useState<Preferences>();

  useEffect(() => {
    if (!hasBridge) return;
    let alive = true;
    void bridge.invoke('prefs:get').then((value) => {
      if (alive) setPrefs(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  useBridgeEvent('prefs:changed', setPrefs);

  const update = useCallback((patch: Partial<Preferences>) => {
    if (!hasBridge) {
      // Nothing to persist to. Keep the change on screen so a preview or a
      // plain-browser render still responds to its own controls.
      setPrefs((current) => (current ? { ...current, ...patch } : current));
      return;
    }
    void bridge.invoke('prefs:set', patch).then(setPrefs);
  }, []);

  return [prefs, update];
}
