import type { IpcChannel, IpcEvent } from '../../shared/ipc.js';

import { bridge } from './bridge.js';
import { currentTerminalTheme } from './theme.js';
import {
  createTerminalTransport,
  type DetachableTerminalTransport,
  type TerminalChannels,
  type TerminalDataMessage,
  type TerminalExitMessage,
  type TerminalSizeMessage,
} from './terminal-transport.js';

/**
 * This application's terminal transport, over its own IPC contract.
 *
 * The wiring itself is `createTerminalTransport`, which `./renderer` exports.
 * So the export is not a second implementation that can drift from the one
 * this repository runs: it is the one this repository runs. This file is the
 * part a consumer replaces, which is the channel names and the bridge.
 *
 * `tests/terminal/terminal-channels.test.ts` pairs these names with the ones
 * `src/main/ipc.ts` registers, because neither half imports the other.
 */

/** The names, pinned to the contract: an undeclared one does not compile. */
export const TERMINAL_CHANNELS: TerminalChannels<IpcChannel, IpcEvent> = {
  spawn: 'pty:spawn',
  write: 'pty:write',
  resize: 'pty:resize',
  ack: 'pty:ack',
  terminate: 'pty:kill',
  list: 'pty:list',
  data: 'pty:data',
  exit: 'pty:exit',
  size: 'pty:size',
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

const baseTransport = createTerminalTransport({
  invoke: (channel, request) => wire.invoke(channel, request),
  on: (event, listener) => wire.on(event, listener),
  channels: TERMINAL_CHANNELS,
});
interface ProjectionView {
  projectionId: string;
  epoch?: number;
  focusRevision: number;
  phase: 'probing' | 'attached';
  cancelled: boolean;
  completed: Promise<void>;
  complete(): void;
}

const projectionViews = new Map<string, ProjectionView>();

function projectionId(): string {
  return `projection-${globalThis.crypto.randomUUID()}`;
}

function projectionFailure(operation: string, id: string): Error {
  return new Error(`Terminal projection ${operation} was rejected for ${id}.`);
}

async function focusProjection(
  id: string,
  projection: ProjectionView,
  cols: number,
  rows: number,
): Promise<void> {
  const revision = ++projection.focusRevision;
  const epoch = await wire.invoke('pty:projection-focus', {
    id,
    projectionId: projection.projectionId,
    cols,
    rows,
  });
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch <= 0) {
    throw projectionFailure('focus', id);
  }
  if (revision === projection.focusRevision) projection.epoch = epoch;
}

function pendingProjection(): ProjectionView {
  let complete: () => void = () => undefined;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return {
    projectionId: projectionId(),
    focusRevision: 0,
    phase: 'probing',
    cancelled: false,
    completed,
    complete,
  };
}

export const bridgeTerminalTransport: DetachableTerminalTransport = {
  ...baseTransport,
  spawn: async ({ id, cols, rows }) => {
    const existing = projectionViews.get(id);
    if (existing?.phase === 'attached') {
      await focusProjection(id, existing, cols, rows);
      return;
    }
    const projection = existing ?? pendingProjection();
    projectionViews.set(id, projection);
    let attached = false;
    try {
      attached = await wire.invoke('pty:projection-attach', {
        id,
        projectionId: projection.projectionId,
        cols,
        rows,
      }) === true;
      if (projection.cancelled || projectionViews.get(id) !== projection) {
        if (attached === true) {
          await wire.invoke('pty:projection-detach', {
            id,
            projectionId: projection.projectionId,
          });
        } else {
          await baseTransport.terminate(id);
        }
        return;
      }
      if (attached) {
        await focusProjection(id, projection, cols, rows);
        if (projection.cancelled || projectionViews.get(id) !== projection) {
          await wire.invoke('pty:projection-detach', {
            id,
            projectionId: projection.projectionId,
          });
          return;
        }
        projection.phase = 'attached';
        return;
      }
    } catch (error) {
      if (projectionViews.get(id) === projection) projectionViews.delete(id);
      if (attached) {
        await wire.invoke('pty:projection-detach', {
          id,
          projectionId: projection.projectionId,
        });
      }
      throw error;
    } finally {
      projection.complete();
    }
    projectionViews.delete(id);
    await wire.invoke('pty:spawn', { id, cols, rows });
  },
  focus: async (id, cols, rows) => {
    const projection = projectionViews.get(id);
    if (projection) await focusProjection(id, projection, cols, rows);
  },
  write: async (id, data) => {
    const projection = projectionViews.get(id);
    if (!projection) return baseTransport.write(id, data);
    if (projection.epoch === undefined) throw projectionFailure('write', id);
    const accepted = await wire.invoke('pty:projection-write', {
      id,
      projectionId: projection.projectionId,
      epoch: projection.epoch,
      data,
    });
    if (accepted !== true) throw projectionFailure('write', id);
  },
  resize: async (id, cols, rows) => {
    const projection = projectionViews.get(id);
    if (!projection) return baseTransport.resize(id, cols, rows);
    if (projection.epoch === undefined) throw projectionFailure('resize', id);
    const accepted = await wire.invoke('pty:projection-resize', {
      id,
      projectionId: projection.projectionId,
      epoch: projection.epoch,
      cols,
      rows,
    });
    if (accepted !== true) throw projectionFailure('resize', id);
  },
  terminate: async (id) => {
    const projection = projectionViews.get(id);
    if (!projection) return baseTransport.terminate(id);
    projection.cancelled = true;
    projectionViews.delete(id);
    if (projection.phase === 'probing') {
      await projection.completed;
      return;
    }
    const detached = await wire.invoke('pty:projection-detach', {
      id,
      projectionId: projection.projectionId,
    });
    if (detached !== true) throw projectionFailure('detach', id);
  },
  ack: async (id, sequence) => {
    if (!projectionViews.has(id)) await baseTransport.ack?.(id, sequence);
  },
  subscribe: (id, listener) => {
    const belongsToView = (message: { projectionId?: string }): boolean => {
      const projection = projectionViews.get(id);
      return projection
        ? message.projectionId === projection.projectionId
        : message.projectionId === undefined;
    };
    const onData = wire.on('pty:data', (payload) => {
      const message = payload as TerminalDataMessage & { projectionId?: string };
      if (message.id === id && belongsToView(message)) {
        listener({ type: 'data', data: message.data, sequence: message.sequence });
      }
    });
    const onExit = wire.on('pty:exit', (payload) => {
      const message = payload as TerminalExitMessage & { projectionId?: string };
      if (message.id === id && belongsToView(message)) {
        listener({ type: 'exit', exitCode: message.exitCode });
      }
    });
    const onSize = wire.on('pty:size', (payload) => {
      const message = payload as TerminalSizeMessage & { projectionId?: string };
      if (message.id === id && belongsToView(message)) {
        listener({ type: 'size', cols: message.cols, rows: message.rows });
      }
    });
    return () => {
      onData();
      onExit();
      onSize();
    };
  },
};

/** The emulator theme for this application's current scheme. */
export { currentTerminalTheme };
