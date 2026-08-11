import type { IpcChannel, IpcEvent } from '../../shared/ipc.js';

import { bridge } from './bridge.js';
import { currentTerminalTheme } from './theme.js';
import {
  createTerminalTransport,
  type DetachableTerminalTransport,
  type TerminalChannels,
} from './terminal-transport.js';

/**
 * This application's terminal transport, over its own IPC contract.
 *
 * The wiring itself is `createTerminalTransport`, which `./renderer` exports.
 * So the export is not a second implementation that can drift from the one
 * this repository runs: it is the one this repository runs. This file is the
 * part a consumer replaces, which is the channel names and the bridge.
 *
 * `tests/terminal-channels.test.ts` pairs these names with the ones
 * `src/main/ipc.ts` registers, because neither half imports the other.
 */

/** The names, pinned to the contract: an undeclared one does not compile. */
export const TERMINAL_CHANNELS: TerminalChannels<IpcChannel, IpcEvent> = {
  spawn: 'pty:spawn',
  write: 'pty:write',
  resize: 'pty:resize',
  terminate: 'pty:kill',
  list: 'pty:list',
  data: 'pty:data',
  exit: 'pty:exit',
};

/**
 * The contract types each channel's request and each event's payload, and the
 * transport is generic over the names alone. One cast joins the two, here
 * rather than in the export, as `src/preload/bridge.ts` does for its own.
 */
const wire = bridge as unknown as {
  invoke: (channel: IpcChannel, request?: unknown) => Promise<unknown>;
  on: (event: IpcEvent, listener: (payload: unknown) => void) => () => void;
};

export const bridgeTerminalTransport: DetachableTerminalTransport =
  createTerminalTransport({
    invoke: (channel, request) => wire.invoke(channel, request),
    on: (event, listener) => wire.on(event, listener),
    channels: TERMINAL_CHANNELS,
  });

/** The emulator theme for this application's current scheme. */
export { currentTerminalTheme };
