import { app, type BrowserWindow } from 'electron';

import {
  TerminalHost,
  type DirectTerminalProfile,
  type TerminalPane,
  type TerminalSession,
} from '@maximal/maximal-terminal';
import type {
  PtySpawnRequest,
  TerminalLaunchRequest,
  TerminalLaunchResult,
} from '@maximal/maximal-terminal';
import { clampTerminalGrid } from '@maximal/maximal-terminal';
import { TmuxControlHost } from '@maximal/maximal-terminal';

import type { PtyEvents, PtyHandlers } from './handlers.js';
import {
  configureDirectTerminalProfiles,
  configureTmuxSessions,
  launcher,
  prepareLauncher,
  tmuxSessionNames,
} from './launcher.js';
import { PtyMirrors } from '@maximal/maximal-terminal';
import {
  stageOwnership,
  type PtyOwnershipPort,
  type PtyOwnershipTransaction,
} from '@maximal/maximal-terminal';
import { PtyPaneDocuments } from '@maximal/maximal-terminal';
import { createPtyProjections } from './projections.js';
import { Owners } from '@maximal/maximal-terminal';
import { defaultShell } from '@maximal/maximal-terminal';
import { TerminalWindowGroups } from '@maximal/maximal-terminal';
import type { TmuxStatusMode } from '@maximal/maximal-terminal';

export type TerminalPaneLayout = TerminalPane;

export interface TerminalRestoreEntry extends TerminalSession {
  title: string;
  canRunInBackground: boolean;
  pane?: TerminalPaneLayout;
  revision?: number;
}
import { TERMINAL_PROGRAM } from '../../terminal-identity.js';

export type { PtyOwnershipTransaction } from '@maximal/maximal-terminal';
export { discoverTerminalTargets, listTerminalProfiles } from './launcher.js';
export { defaultShell } from '@maximal/maximal-terminal';

const events: PtyEvents = {
  emit: () => undefined,
  onExit: () => undefined,
  onStatus: () => undefined,
  onSize: () => undefined,
  onPane: () => undefined,
};

export interface PtyOptions {
  /** Prefix of the tmux sessions this app creates and later offers to resume. */
  tmuxSessionPrefix: string;
  /** App-owned commands offered alongside the built-in terminal destinations. */
  directProfiles?: readonly DirectTerminalProfile[];
  /** Status-line policy for tmux sessions shown inside this application. */
  tmuxStatus?: TmuxStatusMode;
}

export function configurePty(handlers: PtyHandlers, options: PtyOptions): void {
  configureTmuxSessions(options.tmuxSessionPrefix, options.tmuxStatus);
  configureDirectTerminalProfiles(options.directProfiles ?? []);
  events.emit = handlers.emit;
  events.onExit = handlers.onExit;
  events.onStatus = handlers.onStatus;
  events.onSize = handlers.onSize ?? (() => undefined);
  events.onPane = handlers.onPane ?? (() => undefined);
}

const hosts = new Owners<BrowserWindow, TerminalHost>(
  (owner) => {
    owner.once('closed', () => {
      releasePtyOwner(owner);
    });

    return new TerminalHost({
      homeDirectory: app.getPath('home'),
      defaultShell: defaultShell(),
      flowControl: true,
      env: { TERM_PROGRAM: TERMINAL_PROGRAM },
      emit: (id, chunk, sequence) => {
        events.emit(owner, id, chunk, sequence);
      },
      onExit: (id, exitCode) => {
        forgetSessionSize(id);
        events.onExit(owner, id, exitCode);
      },
      onStatus: (status) => {
        events.onStatus(owner, status);
      },
    });
  },
  (host) => {
    host.terminateAll();
  },
);

const controlHosts = new Owners<BrowserWindow, Map<string, TmuxControlHost>>(
  (owner) => {
    owner.once('closed', () => controlHosts.release(owner));
    return new Map();
  },
  (sessions) => {
    for (const session of sessions.values()) session.close();
  },
);

function hostFor(owner: BrowserWindow | undefined): TerminalHost | undefined {
  if (!owner) return undefined;
  return hosts.get(owner);
}

const windowGroups = new TerminalWindowGroups<BrowserWindow>(
  (window) => window.isResizable() ? 'native-window' : 'unavailable',
);

const mirrors = new PtyMirrors<BrowserWindow>({
  onClosed: (window, listener) => window.once('closed', listener),
  subscribe: (owner, recipient, id, done) => hostFor(owner)?.mirror(id, {
    onData: (chunk) => events.emit(recipient, id, chunk),
    onExit: (exitCode) => {
      events.onExit(recipient, id, exitCode);
      done();
    },
  }),
  onDetached: (id, recipient, preserveViewer) => {
    if (!preserveViewer) forgetViewerSize(id, recipient);
  },
  onWindowForgotten: (window) => paneDocuments.forgetWindow(window),
});

const projections = createPtyProjections({
  events,
  onWindowClosed: (window) => windowGroups.removeWindow(window),
  trackViewerSize,
  forgetViewerSize,
  flushPanes: () => paneDocuments.flush(),
});

const paneDocuments = new PtyPaneDocuments<BrowserWindow>({
  viewers: (id) => windowGroups.viewers(id),
  resolveSession: (requestor, sessionId) => {
    if (projections.has(sessionId)) return { owner: requestor, projection: true };
    const owner = mirrors.realOwnerOf(requestor, sessionId);
    return owner && hostFor(owner)?.has(sessionId) ? { owner, projection: false } : undefined;
  },
  setDocument: (id, sessionIds) => windowGroups.setDocument(id, sessionIds),
  share: (_owner, viewer, sessionId) => {
    if (!mirrors.isMirror(viewer, sessionId)) mirrors.register(viewer, sessionId);
  },
  publish: (viewer, id, document) =>
    events.onPane(viewer, id, document.pane, document.revision, document.origin),
});

const restoreMetadata = new Map<string, {
  title: string;
  canRunInBackground: boolean;
  cwd: string;
  shell: string;
  startedAt: number;
}>();

/** Hand each PTY a closing window owns to its oldest attached mirror, or let it go. */
function releasePtyOwner(owner: BrowserWindow): void {
  const source = hostFor(owner);
  for (const id of mirrors.ownedBy(owner)) {
    const recipient = windowGroups.oldestViewer(
      id,
      (candidate) => mirrors.isAttached(id, candidate) && !candidate.isDestroyed(),
    );
    if (!recipient || !source) {
      mirrors.forgetOwner(id);
      continue;
    }
    const grid = windowGroups.viewers(id)?.get(recipient)
      ?? windowGroups.canonical(id)?.grid
      ?? { cols: 80, rows: 24 };
    mirrors.detach(id, recipient, true);
    const destination = hosts.for(recipient);
    if (source.transfer(id, destination, { id, ...grid })) {
      mirrors.setOwner(id, recipient);
      windowGroups.removeViewer(id, owner);
      trackViewerSize(id, recipient, grid.cols, grid.rows);
      reconcileSharedSize(id, recipient);
    } else {
      mirrors.forgetOwner(id);
    }
  }
  windowGroups.removeWindow(owner);
  hosts.release(owner);
}

function trackViewerSize(id: string, window: BrowserWindow, cols: number, rows: number): boolean {
  return windowGroups.observe(id, window, cols, rows);
}

/**
 * Reconciles one PTY grid while the window-group controller separately applies
 * physical geometry once per document. Copy viewers share the canonical grid;
 * tmux/SSH projections keep their own explicit capability contracts.
 */
function reconcileSharedSize(
  id: string,
  realOwner: BrowserWindow,
  requestor?: BrowserWindow,
  cause: 'attach' | 'detach' | 'user' = requestor ? 'user' : 'attach',
): void {
  windowGroups.reconcile(id, cause, ({ cols, rows }) => {
    hostFor(realOwner)?.resize(id, cols, rows);
    for (const [window] of windowGroups.viewers(id) ?? []) {
      if (!window.isDestroyed()) events.onSize(window, id, cols, rows);
    }
  }, requestor);
}

function forgetViewerSize(id: string, window: BrowserWindow): void {
  if (!windowGroups.removeViewer(id, window)) return;
  const realOwner = mirrors.ownerOf(id);
  if (realOwner) reconcileSharedSize(id, realOwner, undefined, 'detach');
}

function forgetSessionSize(id: string): void {
  windowGroups.removeSession(id);
  paneDocuments.forgetSession(id);
  restoreMetadata.delete(id);
}

/** Attaches a registered mirror's actual output subscription, on its first spawn. */
function attachMirror(owner: BrowserWindow, recipient: BrowserWindow, request: PtySpawnRequest): void {
  if (!hostFor(owner) || !mirrors.attach(owner, recipient, request.id)) return;
  trackViewerSize(request.id, recipient, request.cols, request.rows);
  if ((windowGroups.viewers(request.id)?.size ?? 0) > 1) reconcileSharedSize(request.id, owner);
}

function clampRequest(rawRequest: PtySpawnRequest): PtySpawnRequest {
  const { cols, rows } = clampTerminalGrid(rawRequest.cols, rawRequest.rows);
  return cols === rawRequest.cols && rows === rawRequest.rows
    ? rawRequest
    : { ...rawRequest, cols, rows };
}

function spawn(
  owner: BrowserWindow | undefined,
  rawRequest: PtySpawnRequest,
  requireReservation: boolean,
): void {
  if (!owner) return;
  const request = clampRequest(rawRequest);
  if (projections.has(request.id)) {
    projections.openWindowView(owner, request);
    return;
  }
  if (mirrors.isMirror(owner, request.id)) {
    const realOwner = mirrors.ownerOf(request.id);
    if (realOwner) attachMirror(realOwner, owner, request);
    return;
  }
  const paneOwner = mirrors.ownerOf(request.id);
  if (paneOwner && paneOwner !== owner) {
    if (!paneDocuments.isAuthorizedViewer(owner, request.id)) {
      throw new Error(`Terminal session ${request.id} is not authorized for this window.`);
    }
    mirrors.register(owner, request.id);
    attachMirror(paneOwner, owner, request);
    return;
  }
  const reserved = launcher().take(owner, request.id);
  const host = hostFor(owner);
  if (requireReservation && !reserved && !host?.list().some((session) => session.id === request.id)) {
    throw new Error(`Terminal session ${request.id} is not reserved for this window.`);
  }
  (host ?? hosts.for(owner)).spawn(
    reserved
      ? { ...request, shell: reserved.command, cwd: reserved.cwd, args: reserved.args, env: reserved.env }
      : request,
  );
  mirrors.setOwner(request.id, owner);
  trackViewerSize(request.id, owner, request.cols, request.rows);
  paneDocuments.flush();
}

export function spawnPty(
  owner: BrowserWindow | undefined,
  request: PtySpawnRequest,
): void {
  spawn(owner, request, false);
}

/** Attach only to a session the reference launcher created for this window. */
export function spawnReservedPty(
  owner: BrowserWindow | undefined,
  request: PtySpawnRequest,
): void {
  spawn(owner, request, true);
}

export function transferPty(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  rawRequest: PtySpawnRequest,
): boolean {
  if (!owner || !recipient || owner === recipient) return false;
  const realOwner = mirrors.realOwnerOf(owner, rawRequest.id);
  if (!realOwner || realOwner === recipient) return false;
  const request = clampRequest(rawRequest);
  const recipientWasMirror = mirrors.isMirror(recipient, request.id);
  const source = hostFor(realOwner);
  const destination = hosts.for(recipient);
  const moved = source?.transfer(request.id, destination, request) ?? false;
  if (moved) {
    if (recipientWasMirror) mirrors.detach(request.id, recipient, true);
    mirrors.setOwner(request.id, recipient);
    windowGroups.removeViewer(request.id, realOwner);
    trackViewerSize(request.id, recipient, request.cols, request.rows);
    reconcileSharedSize(request.id, recipient);
  }
  return moved;
}

export function copyPty(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  request: PtySpawnRequest,
): boolean {
  if (!owner || !recipient || owner === recipient) return false;
  const realOwner = mirrors.realOwnerOf(owner, request.id);
  if (!realOwner || !hostFor(realOwner)?.has(request.id)) return false;
  windowGroups.registerViewer(request.id, recipient);
  mirrors.register(recipient, request.id);
  return true;
}

export function copyPtyOwnership(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  requests: readonly PtySpawnRequest[],
): boolean {
  return stagePtyOwnership(owner, recipient, requests, 'copy')?.commit() ?? false;
}

const ownershipPort: PtyOwnershipPort<BrowserWindow> = {
  isProjection: (id) => projections.has(id),
  projectionIds: (window, id) => projections.projectionIds(window, id),
  grantProjection: (owner, id, recipient, cols, rows) =>
    projections.grant(owner, id, recipient, cols, rows),
  transferProjection: projections.ownership.transfer,
  revokeProjection: projections.ownership.revoke,
  detachProjection: projections.ownership.detach,
  detachProjectionOwner: projections.ownership.detachOwner,
  forgetProjectionEpoch: projections.forgetEpoch,
  viewerGrid: (id, window) => windowGroups.viewers(id)?.get(window),
  trackViewerSize,
  forgetViewerSize,
  isMirror: (window, id) => mirrors.isMirror(window, id),
  mirrorAttached: (id, window) => mirrors.isAttached(id, window),
  realOwnerOf: (window, id) => mirrors.realOwnerOf(window, id),
  registerMirror: (_owner, recipient, id) => mirrors.register(recipient, id),
  attachMirror,
  detachMirror: (id, recipient) => mirrors.detach(id, recipient),
  copy: copyPty,
  transfer: transferPty,
};

export function stagePtyOwnership(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  requests: readonly PtySpawnRequest[],
  mode: 'copy' | 'move',
): PtyOwnershipTransaction | undefined {
  return stageOwnership(ownershipPort, owner, recipient, requests, mode);
}

export function transferPtyOwnership(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  requests: readonly PtySpawnRequest[],
): boolean {
  return stagePtyOwnership(owner, recipient, requests, 'move')?.commit() ?? false;
}

export function syncPtyPane(
  owner: BrowserWindow | undefined,
  id: string,
  pane: TerminalPaneLayout,
): void {
  if (!owner || !windowGroups.hasViewer(id, owner)) return;
  paneDocuments.request(id, owner, pane);
}

export function launchTerminal(
  owner: BrowserWindow | undefined,
  request: TerminalLaunchRequest,
): TerminalLaunchResult {
  if (!owner) throw new Error('Terminal launch has no owning window.');
  prepareLauncher(owner);
  const result = launcher().launch(owner, request);
  const reserved = launcher().take(owner, result.sessionId);
  if (!reserved) throw new Error('Terminal launch reservation was unavailable.');
  if (result.canRunInBackground) {
    restoreMetadata.set(result.sessionId, {
      title: result.label,
      canRunInBackground: true,
      cwd: reserved.cwd ?? app.getPath('home'),
      shell: reserved.command,
      startedAt: Date.now(),
    });
  }
  if (reserved.tmuxControl) {
    const sessions = controlHosts.for(owner);
    const host = new TmuxControlHost({
      session: tmuxSessionNames().create(),
      emit: (chunk) => events.emit(owner, result.sessionId, chunk),
      onExit: (exitCode) => events.onExit(owner, result.sessionId, exitCode),
    });
    sessions.set(result.sessionId, host);
    return result;
  }
  if (reserved.tmuxProjection) {
    projections.reserve(owner, result.sessionId, {
      command: reserved.command,
      args: reserved.args,
      cwd: reserved.cwd,
      env: reserved.env,
      ownership: reserved.tmuxProjection.ownership,
      geometry: reserved.tmuxProjection.geometry,
      terminate: reserved.tmuxProjection.terminate,
    });
    return result;
  }
  hosts.for(owner).spawn({
    id: result.sessionId,
    cols: request.cols,
    rows: request.rows,
    shell: reserved.command,
    cwd: reserved.cwd,
    args: reserved.args,
    env: reserved.env,
  });
  mirrors.setOwner(result.sessionId, owner);
  trackViewerSize(result.sessionId, owner, request.cols, request.rows);
  paneDocuments.flush();
  return result;
}

export function writePty(
  owner: BrowserWindow | undefined,
  id: string,
  data: string,
): void {
  if (owner && projections.writeWindowView(owner, id, data)) return;
  if (owner) controlHosts.get(owner)?.get(id)?.write(data);
  const realOwner = owner ? mirrors.realOwnerOf(owner, id) : owner;
  hostFor(realOwner)?.write(id, data);
}

export function resizePty(
  owner: BrowserWindow | undefined,
  id: string,
  requestedCols: number,
  requestedRows: number,
): void {
  const { cols, rows } = clampTerminalGrid(requestedCols, requestedRows);
  if (owner && projections.resizeWindowView(owner, id, cols, rows)) return;
  if (owner) controlHosts.get(owner)?.get(id)?.resize(cols, rows);
  const realOwner = owner ? mirrors.realOwnerOf(owner, id) : owner;
  const appliedEcho = owner ? trackViewerSize(id, owner, cols, rows) : false;
  if (appliedEcho && owner) {
    const canonical = windowGroups.canonical(id);
    if (canonical) events.onSize(owner, id, canonical.grid.cols, canonical.grid.rows);
    return;
  }
  const sizes = windowGroups.viewers(id);
  if (sizes && sizes.size > 1 && realOwner && owner) {
    reconcileSharedSize(id, realOwner, owner);
    return;
  }
  hostFor(realOwner)?.resize(id, cols, rows);
}

export const attachPtyProjection = projections.attach;
export const grantPtyProjection = projections.grant;
export const transferPtyProjection = projections.transfer;

/** Record renderer consumption of all output through this sequence. */
export function acknowledgePty(
  owner: BrowserWindow | undefined,
  id: string,
  sequence: number,
): void {
  hostFor(owner)?.acknowledge(id, sequence);
}

export function killPty(owner: BrowserWindow | undefined, id: string): void {
  if (owner && projections.terminate(owner, id)) {
    forgetSessionSize(id);
    return;
  }
  const control = owner ? controlHosts.get(owner)?.get(id) : undefined;
  if (control) {
    control.close();
    controlHosts.get(owner!)?.delete(id);
    return;
  }
  hostFor(owner)?.terminate(id);
}

/** This window's live sessions and main-owned documents, including hidden views. */
export function listPtys(owner: BrowserWindow | undefined): TerminalRestoreEntry[] {
  if (!owner) return [];
  const sessions = new Map<string, TerminalSession>();
  for (const session of hostFor(owner)?.list() ?? []) sessions.set(session.id, session);
  for (const id of mirrors.mirroredBy(owner)) {
    const realOwner = mirrors.ownerOf(id);
    const session = realOwner
      ? hostFor(realOwner)?.list().find((candidate) => candidate.id === id)
      : undefined;
    if (session) sessions.set(id, session);
  }
  for (const id of projections.list(owner)) {
    const metadata = restoreMetadata.get(id);
    sessions.set(id, metadata
      ? { id, cwd: metadata.cwd, shell: metadata.shell, startedAt: metadata.startedAt }
      : { id, cwd: '', shell: '', startedAt: 0 });
  }
  return [...sessions.values()].map((session) => {
    const metadata = restoreMetadata.get(session.id);
    const document = paneDocuments.get(session.id);
    const shellTitle = session.shell.split(/[\\/]/).at(-1);
    return {
      ...session,
      title: metadata?.title
        ?? (shellTitle ? shellTitle : 'Terminal'),
      canRunInBackground: metadata?.canRunInBackground
        ?? projections.has(session.id),
      ...(document?.viewers.has(owner)
        ? { pane: document.pane, revision: document.revision }
        : {}),
    };
  });
}

/** Kill every window's sessions. Call on quit, so no shell outlives the app. */
export function killAllPtys(): void {
  hosts.releaseAll();
  controlHosts.releaseAll();
  projections.abandonAll();
  restoreMetadata.clear();
}
