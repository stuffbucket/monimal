import { app, type BrowserWindow } from 'electron';

import { TmuxProjectionOwners } from '@maximal/maximal-terminal';
import type {
  PtyProjectionAttachRequest,
  PtyProjectionResizeRequest,
  PtyProjectionWriteRequest,
  PtySpawnRequest,
} from '@maximal/maximal-terminal';
import { clampTerminalGrid } from '@maximal/maximal-terminal';
import { execFileRunner } from '@maximal/maximal-terminal';
import type { PtyEvents } from './handlers.js';

type ProjectionLaunch = Parameters<TmuxProjectionOwners<BrowserWindow>['reserve']>[2];

/** What a projection needs from the registry that hosts it. */
export interface PtyProjectionHooks {
  events: PtyEvents;
  onWindowClosed(window: BrowserWindow): void;
  trackViewerSize(id: string, window: BrowserWindow, cols: number, rows: number): void;
  forgetViewerSize(id: string, window: BrowserWindow): void;
  flushPanes(): void;
}

/**
 * Sessions tmux owns rather than a local process. Each window holds its own
 * projection view of the session, and input is fenced by the epoch it focused.
 */
export function createPtyProjections(hooks: PtyProjectionHooks) {
  const { events } = hooks;
  const epochs = new WeakMap<BrowserWindow, Map<string, number>>();
  const prepared = new WeakSet<BrowserWindow>();
  const owners = new TmuxProjectionOwners<BrowserWindow>({
    homeDirectory: app.getPath('home'),
    env: { TERM_PROGRAM: 'Stuffbucket' },
    command: (command, args) =>
      execFileRunner(command, args, { timeout: 5_000, maxBuffer: 64 * 1024 }),
    terminate: (command, args) => {
      void execFileRunner(command, args, { timeout: 2_000, maxBuffer: 64 * 1024 }).catch(() => undefined);
    },
    emit: (owner, sessionId, projectionId, chunk) =>
      events.emit(owner, sessionId, chunk, undefined, projectionId),
    onExit: (owner, sessionId, projectionId, exitCode) =>
      events.onExit(owner, sessionId, exitCode, projectionId),
    onGeometry: (owner, sessionId, projectionId, cols, rows) =>
      events.onSize(owner, sessionId, cols, rows, projectionId),
    onGeometryError: (owner, sessionId, projectionId, error) => {
      const message = error instanceof Error ? error.message : String(error);
      events.emit(
        owner,
        sessionId,
        `\r\n\x1b[31m[terminal geometry rejected: ${message}]\x1b[0m\r\n`,
        undefined,
        projectionId,
      );
    },
  });

  const prepare = (owner: BrowserWindow): void => {
    if (prepared.has(owner)) return;
    prepared.add(owner);
    owner.once('closed', () => {
      owners.release(owner);
      hooks.onWindowClosed(owner);
    });
  };

  /** The projection a window opens for itself through the ordinary PTY calls. */
  const windowView = (owner: BrowserWindow, sessionId: string): string =>
    `${sessionId}:${String(owner.id)}`;

  const focusedEpoch = (owner: BrowserWindow, id: string): number | undefined =>
    owners.has(id) ? epochs.get(owner)?.get(id) : undefined;

  const forgetEpoch = (owner: BrowserWindow, id: string): void => {
    epochs.get(owner)?.delete(id);
  };

  return {
    has: (id: string): boolean => owners.has(id),
    list: (owner: BrowserWindow): Iterable<string> => owners.list(owner),
    projectionIds: (window: BrowserWindow, id: string) => owners.projectionIds(window, id),
    abandonAll: (): void => owners.abandonAll(),
    forgetEpoch,

    reserve: (owner: BrowserWindow, sessionId: string, launch: ProjectionLaunch): void => {
      prepare(owner);
      owners.reserve(owner, sessionId, launch);
    },

    /** Open this window's own view, as a spawn does for a local PTY. */
    openWindowView: (owner: BrowserWindow, request: PtySpawnRequest): void => {
      prepare(owner);
      const projectionId = windowView(owner, request.id);
      owners.attach(owner, { sessionId: request.id, projectionId, cols: request.cols, rows: request.rows });
      hooks.trackViewerSize(request.id, owner, request.cols, request.rows);
      hooks.flushPanes();
      const epoch = owners.focus(owner, request.id, projectionId, request.cols, request.rows);
      if (epoch === undefined) return;
      const byId = epochs.get(owner) ?? new Map<string, number>();
      byId.set(request.id, epoch);
      epochs.set(owner, byId);
    },

    /** Write through this window's own view; false when it has not focused one. */
    writeWindowView: (owner: BrowserWindow, id: string, data: string): boolean => {
      const epoch = focusedEpoch(owner, id);
      if (epoch === undefined) return false;
      owners.write(owner, id, windowView(owner, id), epoch, data);
      return true;
    },

    /** Resize this window's own view; false when it has not focused one. */
    resizeWindowView: (owner: BrowserWindow, id: string, cols: number, rows: number): boolean => {
      const epoch = focusedEpoch(owner, id);
      if (epoch === undefined) return false;
      owners.resize(owner, id, windowView(owner, id), epoch, cols, rows);
      return true;
    },

    attach: (owner: BrowserWindow | undefined, request: PtyProjectionAttachRequest): boolean => {
      if (!owner) return false;
      prepare(owner);
      const { cols, rows } = clampTerminalGrid(request.cols, request.rows);
      return owners.attach(owner, { sessionId: request.id, projectionId: request.projectionId, cols, rows });
    },

    focus: (owner: BrowserWindow | undefined, request: PtyProjectionAttachRequest): number | undefined => {
      if (!owner) return undefined;
      const { cols, rows } = clampTerminalGrid(request.cols, request.rows);
      return owners.focus(owner, request.id, request.projectionId, cols, rows);
    },

    write: (owner: BrowserWindow | undefined, request: PtyProjectionWriteRequest): boolean => {
      if (!owner) return false;
      return owners.write(owner, request.id, request.projectionId, request.epoch, request.data) ?? false;
    },

    resize: (owner: BrowserWindow | undefined, request: PtyProjectionResizeRequest): boolean => {
      if (!owner) return false;
      const { cols, rows } = clampTerminalGrid(request.cols, request.rows);
      return owners.resize(owner, request.id, request.projectionId, request.epoch, cols, rows) ?? false;
    },

    detach: (owner: BrowserWindow | undefined, id: string, projectionId: string): boolean => {
      if (!owner || !owners.detach(owner, id, projectionId)) return false;
      hooks.forgetViewerSize(id, owner);
      return true;
    },

    /** Authorize one destination window to attach its next projection. */
    grant: (
      owner: BrowserWindow | undefined,
      id: string,
      recipient: BrowserWindow | undefined,
      cols = 80,
      rows = 24,
    ): boolean => {
      if (!owner || !recipient) return false;
      prepare(recipient);
      const granted = owners.grant(owner, id, recipient);
      if (granted) hooks.trackViewerSize(id, recipient, cols, rows);
      return granted;
    },

    /** Move projection authority to a destination window and detach the old view. */
    transfer: (
      owner: BrowserWindow | undefined,
      id: string,
      recipient: BrowserWindow | undefined,
      cols = 80,
      rows = 24,
    ): boolean => {
      if (!owner || !recipient) return false;
      prepare(recipient);
      if (!owners.transfer(owner, id, recipient)) return false;
      owners.detachOwner(owner, id);
      forgetEpoch(owner, id);
      hooks.forgetViewerSize(id, owner);
      hooks.trackViewerSize(id, recipient, cols, rows);
      return true;
    },

    /** End a projected session this window owns; false when it owns none by that id. */
    terminate: (owner: BrowserWindow, id: string): boolean => {
      if (!owners.terminate(owner, id)) return false;
      forgetEpoch(owner, id);
      return true;
    },

    /** Raw authority moves for an ownership transaction, which does its own bookkeeping. */
    ownership: {
      transfer: (from: BrowserWindow, id: string, to: BrowserWindow) => owners.transfer(from, id, to),
      revoke: (owner: BrowserWindow, id: string, recipient: BrowserWindow) => owners.revoke(owner, id, recipient),
      detach: (window: BrowserWindow, id: string, projectionId: string) => owners.detach(window, id, projectionId),
      detachOwner: (owner: BrowserWindow, id: string) => owners.detachOwner(owner, id),
    },
  };
}
