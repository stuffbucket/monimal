import { useEffect, useState } from 'react';

import {
  createTerminalTransport,
  readTerminalTheme,
  SHELL_TERMINAL_PROPERTIES,
  type DetachableTerminalTransport,
  type ThemePreference,
} from '@stuffbucket/maximal-electron/renderer';

/**
 * What this fixture asks of the window that hosts it.
 *
 * The fixture imports the shell through the package's own `exports` map, so it
 * has the same reach a dependent project has: the components, and nothing this
 * repository keeps private. The channel names below are literals for the same
 * reason `src/preload/capabilities.ts` writes its own — a consumer names its
 * own channels, and importing `src/shared/ipc.ts` would be reaching past the
 * package into the application that publishes it.
 *
 * `docs/embedding.md` gives a consumer no renderer-side client on purpose:
 * "A consumer writes `typeof window.myApp?.openExternal === 'function'`, which
 * is one line and needs no package." This file is that line, plus the wiring
 * `createTerminalTransport` exists to save every consumer writing.
 */

interface HostBridge {
  invoke: (channel: string, request?: unknown) => Promise<unknown>;
  on: (event: string, listener: (payload: unknown) => void) => () => void;
}

/** The host this fixture happens to run in. Its own preload picked the key. */
const NAMESPACE = 'stuffbucket';

function resolveHost(): HostBridge | undefined {
  const candidate = (globalThis as Record<string, unknown>)[NAMESPACE] as
    | Partial<HostBridge>
    | undefined;
  if (typeof candidate?.invoke !== 'function') return undefined;
  if (typeof candidate.on !== 'function') return undefined;
  return candidate as HostBridge;
}

const host = resolveHost();

/**
 * The stand-in for a page with no host, so importing this module never throws.
 * `invoke` rejects rather than resolving undefined: a caller handed
 * `undefined` where it expected a session list renders something wrong and
 * says nothing.
 */
const ABSENT = 'The demo fixture is running outside its host window.';

const wire: HostBridge = host ?? {
  invoke: () => Promise.reject(new Error(ABSENT)),
  on: () => () => undefined,
};

/** What this fixture's host calls each terminal channel. */
export const DEMO_TERMINAL_CHANNELS = {
  spawn: 'pty:spawn',
  write: 'pty:write',
  resize: 'pty:resize',
  terminate: 'pty:kill',
  list: 'pty:list',
  data: 'pty:data',
  exit: 'pty:exit',
} as const;

export const demoTerminalTransport: DetachableTerminalTransport =
  createTerminalTransport({
    invoke: (channel, request) => wire.invoke(channel, request),
    on: (event, listener) => wire.on(event, listener),
    channels: DEMO_TERMINAL_CHANNELS,
  });

/**
 * The emulator's colours, resolved from the fixture's own `--shell-*` block.
 *
 * `ghostty-web` draws to a canvas and inherits nothing from CSS, so the three
 * runtime properties in `docs/shell-variables.md` are read here rather than by
 * a rule. `demo.css` declares them on `:root`, which is why this reads the
 * document element and not the shell container.
 */
export function demoTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);
  return readTerminalTheme(
    (property) => styles.getPropertyValue(property),
    SHELL_TERMINAL_PROPERTIES,
  );
}

const PREFERENCES_CHANNEL = 'prefs:get';
const PREFERENCES_EVENT = 'prefs:changed';

/**
 * The host's theme preference, and every later change to it.
 *
 * The subscription is not optional. The recording's closing shot has an agent
 * call `set_theme` in the main process, and the window is expected to repaint
 * on its own; a read at mount alone would hold the dark picture.
 */
export function useHostTheme(): ThemePreference | undefined {
  const [preference, setPreference] = useState<ThemePreference>();

  useEffect(() => {
    if (!host) return;
    let alive = true;

    void host.invoke(PREFERENCES_CHANNEL).then((value) => {
      if (alive) setPreference(value as ThemePreference);
    });

    const off = host.on(PREFERENCES_EVENT, (payload) => {
      setPreference(payload as ThemePreference);
    });

    return () => {
      alive = false;
      off();
    };
  }, []);

  return preference;
}
