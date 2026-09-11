import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  IPC_CHANNELS,
  IPC_EVENTS,
  MAX_PTY_DIMENSION,
  MAX_PTY_WRITE_BYTES,
  isPtyAcknowledgement,
  isPtyIdRequest,
  isPtyResizeRequest,
  isPtySpawnRequest,
  isPtyProjectionAttachRequest,
  isPtyProjectionRequest,
  isPtyProjectionResizeRequest,
  isPtyProjectionWriteRequest,
  isPtyWriteRequest,
  isTerminalLaunchRequest,
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
    expect(channels).toHaveLength(22);
    expect(events).toHaveLength(7);
  });

  it('keeps the terminal channels together', () => {
    // The pty channels are the only ones that spawn a process, so they are
    // worth naming explicitly rather than trusting a count.
    const pty = IPC_CHANNELS.filter((channel) => channel.startsWith('pty:'));
    expect(pty).toEqual([
      'pty:spawn',
      'pty:write',
      'pty:resize',
      'pty:ack',
      'pty:kill',
      'pty:list',
      'pty:projection-attach',
      'pty:projection-focus',
      'pty:projection-write',
      'pty:projection-resize',
      'pty:projection-detach',
      'pty:default-shell',
    ]);
  });

  it('keeps launcher requests free of executable configuration', () => {
    const request = { profileId: 'local', targetId: 'local', cols: 80, rows: 24 };
    expect(Object.keys(request)).toEqual(['profileId', 'targetId', 'cols', 'rows']);
    expect(Object.keys(request)).not.toContain('cwd');
    expect(Object.keys(request)).not.toContain('env');
    expect(Object.keys(request)).not.toContain('args');
  });

  it('rejects executable configuration and malformed dimensions at the terminal boundary', () => {
    expect(isPtySpawnRequest({ id: 'session', cols: 80, rows: 24 })).toBe(true);
    expect(isPtySpawnRequest({ id: 'session', cols: 80, rows: 24, shell: '/bin/sh' })).toBe(false);
    expect(isPtySpawnRequest({ id: 'session', cols: 80, rows: 24, args: ['-c', 'unsafe'] })).toBe(false);
    expect(isPtySpawnRequest({ id: 'session', cols: 80, rows: 24, env: { PATH: '/tmp' } })).toBe(false);
    expect(isPtySpawnRequest({ id: 'session', cols: 0, rows: 24 })).toBe(false);
    expect(isTerminalLaunchRequest({ profileId: 'local', cols: 80, rows: 24 })).toBe(true);
    expect(isTerminalLaunchRequest({ profileId: 'local', cols: 80, rows: 24, cwd: '/' })).toBe(false);
  });

  it('validates projection identity, focus epochs, and geometry exactly', () => {
    expect(isPtyProjectionRequest({ id: 'session', projectionId: 'left' })).toBe(true);
    expect(isPtyProjectionRequest({ id: 'session', projectionId: 'left', epoch: 1 })).toBe(false);
    expect(isPtyProjectionAttachRequest({ id: 'session', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
    expect(isPtyProjectionAttachRequest({ id: 'session', projectionId: 'left', cols: 0, rows: 24 })).toBe(false);
    expect(isPtyProjectionWriteRequest({ id: 'session', projectionId: 'left', epoch: 1, data: 'ls\r' })).toBe(true);
    expect(isPtyProjectionWriteRequest({ id: 'session', projectionId: 'left', epoch: 0, data: 'ls\r' })).toBe(false);
    expect(isPtyProjectionWriteRequest({ id: 'session', projectionId: 'left', epoch: MAX_PTY_DIMENSION + 1, data: 'ls\r' })).toBe(true);
    expect(isPtyProjectionResizeRequest({ id: 'session', projectionId: 'left', epoch: 2, cols: 100, rows: 40 })).toBe(true);
    expect(isPtyProjectionResizeRequest({ id: 'session', projectionId: 'left', epoch: 2, cols: 100, rows: -1 })).toBe(false);
  });

  it('rejects malformed terminal identifiers on every session channel', () => {
    const invalidId = '../another-window';
    expect(isPtySpawnRequest({ id: invalidId, cols: 80, rows: 24 })).toBe(false);
    expect(isPtyWriteRequest({ id: invalidId, data: 'input' })).toBe(false);
    expect(isPtyResizeRequest({ id: invalidId, cols: 80, rows: 24 })).toBe(false);
    expect(isPtyAcknowledgement({ id: invalidId, sequence: 1 })).toBe(false);
    expect(isPtyIdRequest({ id: invalidId })).toBe(false);
    expect(isPtyProjectionRequest({ id: invalidId, projectionId: 'left' })).toBe(false);
    expect(isPtyProjectionAttachRequest({ id: 'session', projectionId: invalidId, cols: 80, rows: 24 })).toBe(false);
    expect(isPtyProjectionWriteRequest({ id: 'session', projectionId: invalidId, epoch: 1, data: 'input' })).toBe(false);
    expect(isPtyProjectionResizeRequest({ id: 'session', projectionId: invalidId, epoch: 1, cols: 80, rows: 24 })).toBe(false);
  });

  it('rejects terminal dimensions that native PTY implementations cannot represent', () => {
    expect(isPtySpawnRequest({ id: 'session', cols: MAX_PTY_DIMENSION, rows: 24 })).toBe(true);
    expect(isPtySpawnRequest({ id: 'session', cols: MAX_PTY_DIMENSION + 1, rows: 24 })).toBe(false);
    expect(isPtyResizeRequest({ id: 'session', cols: 80, rows: MAX_PTY_DIMENSION + 1 })).toBe(false);
  });

  it('rejects terminal writes above the bounded IPC payload', () => {
    expect(isPtyWriteRequest({ id: 'session', data: 'a'.repeat(MAX_PTY_WRITE_BYTES) })).toBe(true);
    expect(isPtyWriteRequest({ id: 'session', data: 'a'.repeat(MAX_PTY_WRITE_BYTES + 1) })).toBe(false);
    expect(isPtyWriteRequest({ id: 'session', data: '\u{1F642}'.repeat(MAX_PTY_WRITE_BYTES / 2) })).toBe(false);
    expect(isPtyProjectionWriteRequest({ id: 'session', projectionId: 'left', epoch: 1, data: 'a'.repeat(MAX_PTY_WRITE_BYTES + 1) })).toBe(false);
  });

  it('whitelists terminal lifecycle status events', () => {
    expect(IPC_EVENTS).toContain('pty:status');
  });
});

describe('default preferences', () => {
  it('leaves the menu bar icon off', () => {
    // A document application should not claim a menu bar slot uninvited.
    expect(DEFAULT_PREFERENCES.menuBarIcon).toBe(false);
  });

  it('asks before quitting with the last window', () => {
    expect(DEFAULT_PREFERENCES.quitOnLastWindowClosed).toBe(false);
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
});
