import { describe, expect, it, vi } from 'vitest';

import {
  registerTerminalChannels,
  type TerminalChannelHost,
} from '../src/host/terminal-host.js';
import { BRIDGE_KEY, IPC_CHANNELS, IPC_EVENTS } from '../src/shared/ipc.js';

/**
 * The two halves of the terminal wire name the same channels.
 *
 * `src/renderer/lib/bridge-terminal.ts` hands `createTerminalTransport` this
 * shell's names, and `src/main/ipc.ts` hands `registerTerminalChannels` the
 * same five. Neither imports the other, and neither may: `./renderer` and
 * `./host/terminal` are a consumer's exports, and this repository's contract
 * inside either is what `npm run verify:neutral` fails on. That is the
 * deliberate duplication `tests/bridge-capabilities.test.ts` covers for the
 * preload bridge, and this is the check it owes: two copies with nothing
 * comparing them is how they drift, so this compares them from the one place
 * that may see both.
 *
 * Both halves are driven rather than read. A map neither half used would agree
 * with itself while the application spoke to nobody.
 */

const recorded = vi.hoisted(() => ({ registered: [] as string[] }));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0', isPackaged: false },
  shell: { openExternal: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: {
    handle: (channel: string) => {
      recorded.registered.push(channel);
    },
  },
}));

vi.mock('../src/main/native/agent.js', () => ({
  abortAgent: vi.fn(),
  discoverProvider: vi.fn(),
  isAgentBusy: vi.fn(),
  resolveApproval: vi.fn(),
  runAgent: vi.fn(),
}));
vi.mock('../src/main/native/llama.js', () => ({ ensureModel: vi.fn() }));
vi.mock('../src/main/native/notifications.js', () => ({
  setBadgeCount: vi.fn(),
  showNotification: vi.fn(),
}));
vi.mock('../src/main/native/preferences.js', () => ({
  getPreferences: vi.fn(),
  setPreferences: vi.fn(),
}));
vi.mock('../src/main/native/pty.js', () => ({
  defaultShell: vi.fn(),
  killPty: vi.fn(),
  listPtys: vi.fn(() => []),
  resizePty: vi.fn(),
  spawnPty: vi.fn(),
  writePty: vi.fn(),
}));
vi.mock('../src/main/native/updates.js', () => ({ checkForUpdates: vi.fn() }));
vi.mock('../src/main/windows/overlay.js', () => ({
  hideOverlay: vi.fn(),
  toggleOverlay: vi.fn(),
}));

const main = await import('../src/main/ipc.js');

/* --------------------------------------------------- the renderer half */

const called: string[] = [];
const subscribed: string[] = [];

// The bridge the preload would expose, in place before the module that reads
// it loads. `bridgeTerminalTransport` is then the shipped object, not a copy
// of it built from the same map.
(globalThis as Record<string, unknown>)[BRIDGE_KEY] = {
  invoke: (channel: string) => {
    called.push(channel);
    return Promise.resolve([]);
  },
  on: (event: string) => {
    subscribed.push(event);
    return () => undefined;
  },
};

const { bridgeTerminalTransport } = await import(
  '../src/renderer/lib/bridge-terminal.js'
);

await bridgeTerminalTransport.spawn({ id: 'one', cols: 80, rows: 24 });
await bridgeTerminalTransport.write('one', 'ls\r');
await bridgeTerminalTransport.resize('one', 100, 40);
await bridgeTerminalTransport.terminate('one');
await bridgeTerminalTransport.list();
bridgeTerminalTransport.subscribe('one', () => undefined);

/* ------------------------------------------------------- the main half */

/** Every name `registerTerminalChannels` answers, given what `ipc.ts` passes. */
function answered(): string[] {
  const names: string[] = [];
  const host: TerminalChannelHost = {
    spawn: () => undefined,
    write: () => undefined,
    resize: () => undefined,
    terminate: () => undefined,
    list: () => [],
  };

  registerTerminalChannels(
    {
      handle: (channel: string) => {
        names.push(channel);
      },
    },
    host,
    { channels: main.TERMINAL_CHANNELS },
  );

  return names;
}

describe('the terminal channels', () => {
  it('calls and answers the same set', () => {
    const names = answered();

    // The floors. Either half reaching no channel would agree with an empty
    // set, which is the failure this file exists to make visible.
    expect(called.length).toBeGreaterThan(0);
    expect(names.length).toBeGreaterThan(0);

    expect(names).toHaveLength(called.length);
    expect(new Set(names)).toEqual(new Set(called));
  });

  it('reaches five request channels and two events', () => {
    // A transport that used one name for two operations would pass the set
    // comparison above, because a set does not count.
    expect(called).toHaveLength(5);
    expect(new Set(called).size).toBe(called.length);
    expect(subscribed).toHaveLength(2);
    expect(new Set(subscribed).size).toBe(subscribed.length);
  });

  it('names only channels and events this shell declares', () => {
    const names = [...called, ...subscribed];
    expect(names).toHaveLength(7);
    expect(called.filter((channel) => !IPC_CHANNELS.includes(channel as never))).toEqual([]);
    expect(subscribed.filter((event) => !IPC_EVENTS.includes(event as never))).toEqual([]);
  });

  it('registers every channel the contract declares, once', () => {
    // The terminal channels left the handler map, so the guarantee that map
    // gave — a declared channel without a handler is a compile error — now
    // rests on the two registrations together covering the contract.
    recorded.registered.length = 0;
    main.registerIpcHandlers();

    expect(recorded.registered.length).toBeGreaterThan(0);
    expect([...recorded.registered].sort()).toEqual([...IPC_CHANNELS].sort());
    expect(recorded.registered.filter((channel) => called.includes(channel)).sort()).toEqual(
      [...called].sort(),
    );
  });
});
