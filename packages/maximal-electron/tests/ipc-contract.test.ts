import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcChannel,
  type IpcEvent,
} from '../src/shared/ipc.js';

/**
 * The contract's guarantees are mostly enforced by the compiler. These tests
 * cover the parts a type cannot reach: the runtime lists that the preload
 * bridge checks names against.
 *
 * That check is the security boundary. If a list drifts from the type map, a
 * channel silently stops working, or worse, an unlisted one becomes reachable.
 */

describe('IPC contract', () => {
  it('exposes every channel exactly once', () => {
    expect(new Set(IPC_CHANNELS).size).toBe(IPC_CHANNELS.length);
  });

  it('exposes every event exactly once', () => {
    expect(new Set(IPC_EVENTS).size).toBe(IPC_EVENTS.length);
  });

  it('namespaces every channel', () => {
    // A bare name like "versions" is easy to collide with an Electron internal.
    for (const channel of IPC_CHANNELS) {
      expect(channel, `${channel} needs a namespace`).toContain(':');
    }
  });

  it('namespaces every event', () => {
    for (const event of IPC_EVENTS) {
      expect(event, `${event} needs a namespace`).toContain(':');
    }
  });

  it('keeps channels and events disjoint', () => {
    // An overlapping name would make `invoke` and `on` ambiguous in the bridge.
    const channels = new Set<string>(IPC_CHANNELS);
    const overlap = IPC_EVENTS.filter((event) => channels.has(event));
    expect(overlap).toEqual([]);
  });

  it('pins the expected surface', () => {
    // A deliberate tripwire. Adding a channel is fine; doing it without
    // noticing this list is not. Update it in the same change.
    const channels: IpcChannel[] = [...IPC_CHANNELS];
    const events: IpcEvent[] = [...IPC_EVENTS];
    expect(channels).toHaveLength(20);
    expect(events).toHaveLength(11);
  });

  it('keeps the terminal channels together', () => {
    // The pty channels are the only ones that spawn a process, so they are
    // worth naming explicitly rather than trusting a count.
    const pty = IPC_CHANNELS.filter((channel) => channel.startsWith('pty:'));
    expect(pty).toEqual([
      'pty:spawn',
      'pty:write',
      'pty:resize',
      'pty:kill',
      'pty:list',
      'pty:default-shell',
    ]);
  });
});

describe('default preferences', () => {
  it('leaves the menu bar icon off', () => {
    // A document application should not claim a menu bar slot uninvited.
    expect(DEFAULT_PREFERENCES.menuBarIcon).toBe(false);
  });

  it('follows the system theme', () => {
    expect(DEFAULT_PREFERENCES.theme).toBe('system');
  });

  it('terminates a terminal session with its view', () => {
    // Detach leaves a process running that the user can no longer see, so it
    // is a choice. Flipping this default would leak a shell for anyone who
    // relies on a tab close ending one.
    expect(DEFAULT_PREFERENCES.terminalDetach).toBe(false);
  });

  it('ships a summon accelerator', () => {
    // An empty accelerator would leave the overlay unreachable, because there
    // is no other entry point to it.
    expect(DEFAULT_PREFERENCES.overlayHotkey.length).toBeGreaterThan(0);
    expect(DEFAULT_PREFERENCES.overlayHotkey).toContain('+');
  });
});
