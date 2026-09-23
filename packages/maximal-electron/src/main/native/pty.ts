import { app, type BrowserWindow } from 'electron';

import {
  TerminalHost,
  TmuxProjectionOwners,
  type TerminalSession,
} from '../../host/terminal-host.js';
import type {
  PtyProjectionAttachRequest,
  PtyProjectionResizeRequest,
  PtyProjectionWriteRequest,
  PtySpawnRequest,
  TerminalDiscovery,
  TerminalLaunchRequest,
  TerminalLaunchResult,
  TerminalProfileSummary,
} from '../../host/electron-terminal-contract.js';
import {
  TerminalLauncher,
  loadTerminalProfiles,
} from './terminal-launcher.js';
import {
  DockerConnector,
  execFileRunner,
  KubernetesConnector,
  LimaConnector,
  MultipassConnector,
  PodmanConnector,
  SshConnector,
  SshTmuxConnector,
  TmuxConnector,
  VagrantConnector,
  WslConnector,
} from './command-connectors.js';
import { TmuxControlHost } from './tmux-control-host.js';
import { isTerminalLab, terminalLabLaunch } from './terminal-lab.js';
import { clampTerminalGrid } from '../../shared/terminal-grid.js';
import type { TerminalPaneLayout } from '../../shared/ipc.js';

import { Owners } from './pty-session.js';
import type { PtyHandlers } from './pty-handlers.js';
import { TerminalWindowGroups } from './pty-window-groups.js';

/**
 * Pseudo-terminal sessions, one manager per window.
 *
 * The shell runs here, in the main process. The renderer holds an xterm
 * terminal, which is a view and an input encoder, not a process host. Bytes
 * flow main to renderer as `pty:data` events, and renderer to main through the
 * `pty:write` channel.
 *
 * This split is what keeps `sandbox: true` on the renderer. The renderer never
 * spawns anything.
 *
 * The manager is `TerminalHost`, the same class `./host/terminal` exports.
 * This file is the Electron half of it: which window owns a session, where a
 * session starts, and where its output goes.
 */

let emit: PtyHandlers['emit'] = () => undefined;
let onExit: PtyHandlers['onExit'] = () => undefined;
let onStatus: PtyHandlers['onStatus'] = () => undefined;
let onSize: NonNullable<PtyHandlers['onSize']> = () => undefined;
let onPane: NonNullable<PtyHandlers['onPane']> = () => undefined;

export function configurePty(handlers: PtyHandlers): void {
  emit = handlers.emit;
  onExit = handlers.onExit;
  onStatus = handlers.onStatus;
  onSize = handlers.onSize ?? (() => undefined);
  onPane = handlers.onPane ?? (() => undefined);
}

/** The user's login shell, or a sane default for the platform. */
export function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env['COMSPEC'] ?? 'powershell.exe';
  }
  return process.env['SHELL'] ?? '/bin/zsh';
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
      // Programs read this to name the terminal they are running under.
      env: { TERM_PROGRAM: 'Stuffbucket' },
      emit: (id, chunk, sequence) => {
        emit(owner, id, chunk, sequence);
      },
      onExit: (id, exitCode) => {
        forgetSessionSize(id);
        onExit(owner, id, exitCode);
      },
      onStatus: (status) => {
        onStatus(owner, status);
      },
    });
  },
  (host) => {
    host.terminateAll();
  },
);

const launcher = new TerminalLauncher<BrowserWindow>({
  localLaunch: isTerminalLab() ? terminalLabLaunch(app.getAppPath()) : undefined,
  connectors: [
    new DockerConnector(execFileRunner),
    new PodmanConnector(execFileRunner),
    new LimaConnector(execFileRunner),
    new MultipassConnector(execFileRunner),
    new KubernetesConnector(execFileRunner),
    new WslConnector(execFileRunner),
    new VagrantConnector(execFileRunner),
    new SshConnector(app.getPath('home'), undefined, execFileRunner),
    new TmuxConnector(execFileRunner),
    new SshTmuxConnector(app.getPath('home'), undefined, execFileRunner),
  ],
});
const launchOwners = new WeakSet<BrowserWindow>();
const controlHosts = new Owners<BrowserWindow, Map<string, TmuxControlHost>>(
  (owner) => {
    owner.once('closed', () => controlHosts.release(owner));
    return new Map();
  },
  (sessions) => {
    for (const session of sessions.values()) session.close();
  },
);
const projectionEpochs = new WeakMap<BrowserWindow, Map<string, number>>();
const projectionOwners = new WeakSet<BrowserWindow>();
const projections = new TmuxProjectionOwners<BrowserWindow>({
  homeDirectory: app.getPath('home'),
  env: { TERM_PROGRAM: 'Stuffbucket' },
  command: (command, args) =>
    execFileRunner(command, args, { timeout: 5_000, maxBuffer: 64 * 1024 }),
  terminate: (command, args) => {
    void execFileRunner(command, args, { timeout: 2_000, maxBuffer: 64 * 1024 }).catch(() => undefined);
  },
  emit: (owner, sessionId, projectionId, chunk) => emit(owner, sessionId, chunk, undefined, projectionId),
  onExit: (owner, sessionId, projectionId, exitCode) => onExit(owner, sessionId, exitCode, projectionId),
  onGeometry: (owner, sessionId, projectionId, cols, rows) =>
    onSize(owner, sessionId, cols, rows, projectionId),
  onGeometryError: (owner, sessionId, projectionId, error) => {
    const message = error instanceof Error ? error.message : String(error);
    emit(
      owner,
      sessionId,
      `\r\n\x1b[31m[terminal geometry rejected: ${message}]\x1b[0m\r\n`,
      undefined,
      projectionId,
    );
  },
});

function prepareProjectionOwner(owner: BrowserWindow): void {
  if (projectionOwners.has(owner)) return;
  projectionOwners.add(owner);
  owner.once('closed', () => {
    projections.release(owner);
    windowGroups.removeWindow(owner);
  });
}

function windowProjectionId(owner: BrowserWindow, sessionId: string): string {
  return `${sessionId}:${String(owner.id)}`;
}

function prepareLauncher(owner: BrowserWindow): void {
  loadTerminalProfiles(app.getPath('userData'));
  if (launchOwners.has(owner)) return;
  launchOwners.add(owner);
  owner.once('closed', () => launcher.release(owner));
}

function hostFor(owner: BrowserWindow | undefined): TerminalHost | undefined {
  if (!owner) return undefined;
  return hosts.get(owner);
}

/*
 * "Copy into New Window" registry.
 *
 * A copy does not move a session's process; it adds a second window that
 * watches the same one. `sessionOwner` is the one place that answers "which
 * window actually holds this process right now", kept current across a
 * `transferPty()` so a copy still finds it after its original moves.
 * `mirrorIds` marks which (window, id) pairs are a *view* rather than the
 * owner, so a normal `pty:spawn`/`pty:write`/`pty:resize` from that window can
 * be redirected without the renderer knowing anything changed.
 */
const sessionOwner = new Map<string, BrowserWindow>();
const mirrorIds = new WeakMap<BrowserWindow, Set<string>>();
const mirrorDetachers = new Map<string, Map<BrowserWindow, () => void>>();
const mirrorHooked = new WeakSet<BrowserWindow>();
const paneSessionViewers = new Map<string, Set<BrowserWindow>>();

function isMirrorWindow(window: BrowserWindow, id: string): boolean {
  return mirrorIds.get(window)?.has(id) ?? false;
}

/** Resolves every sibling directly to the canonical process owner; mirrors never form chains. */
function realOwnerOf(window: BrowserWindow, id: string): BrowserWindow | undefined {
  return isMirrorWindow(window, id) ? sessionOwner.get(id) : window;
}

/**
 * Keeps a shared process alive when its current owner window closes by moving
 * ownership to a live declared viewer. A session with no remaining viewer
 * retains the normal owner-scoped termination policy.
 */
function releasePtyOwner(owner: BrowserWindow): void {
  const source = hostFor(owner);
  for (const [id, sessionOwnerWindow] of [...sessionOwner]) {
    if (sessionOwnerWindow !== owner) continue;
    const attachedMirrors = mirrorDetachers.get(id);
    const recipient = windowGroups.oldestViewer(
      id,
      (candidate) => attachedMirrors?.has(candidate) === true && !candidate.isDestroyed(),
    );
    if (!recipient || !source) {
      sessionOwner.delete(id);
      continue;
    }
    const grid = windowGroups.viewers(id)?.get(recipient)
      ?? windowGroups.canonical(id)?.grid
      ?? { cols: 80, rows: 24 };
    detachMirror(id, recipient, true);
    const destination = hosts.for(recipient);
    if (source.transfer(id, destination, { id, ...grid })) {
      sessionOwner.set(id, recipient);
      windowGroups.removeViewer(id, owner);
      trackViewerSize(id, recipient, grid.cols, grid.rows);
      reconcileSharedSize(id, recipient);
    } else {
      sessionOwner.delete(id);
    }
  }
  windowGroups.removeWindow(owner);
  hosts.release(owner);
}

function detachMirror(id: string, recipient: BrowserWindow, preserveViewer = false): void {
  const bySession = mirrorDetachers.get(id);
  bySession?.get(recipient)?.();
  bySession?.delete(recipient);
  if (bySession && bySession.size === 0) mirrorDetachers.delete(id);
  mirrorIds.get(recipient)?.delete(id);
  if (!preserveViewer) forgetViewerSize(id, recipient);
}

function forgetMirrorWindow(window: BrowserWindow): void {
  const ids = mirrorIds.get(window);
  if (!ids) return;
  for (const id of [...ids]) detachMirror(id, window);
  mirrorIds.delete(window);
  for (const viewers of paneSessionViewers.values()) viewers.delete(window);
  for (const document of paneDocuments.values()) document.viewers.delete(window);
}

const windowGroups = new TerminalWindowGroups<BrowserWindow>(
  (window) => window.isResizable() ? 'native-window' : 'unavailable',
);
const pendingPaneSyncs = new Map<string, {
  requestor: BrowserWindow;
  pane: TerminalPaneLayout;
}>();
const paneDocuments = new Map<string, {
  pane: TerminalPaneLayout;
  revision: number;
  origin: string;
  viewers: Set<BrowserWindow>;
}>();

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
      if (!window.isDestroyed()) onSize(window, id, cols, rows);
    }
  }, requestor);
}

/** Drops one viewer's size entry, restoring the rest once it is gone. */
function forgetViewerSize(id: string, window: BrowserWindow): void {
  if (!windowGroups.removeViewer(id, window)) return;
  const realOwner = sessionOwner.get(id);
  if (realOwner) reconcileSharedSize(id, realOwner, undefined, 'detach');
}

/** Drops every size-tracking entry for a session that has fully exited. */
function forgetSessionSize(id: string): void {
  windowGroups.removeSession(id);
  pendingPaneSyncs.delete(id);
  paneSessionViewers.delete(id);
  paneDocuments.delete(id);
}

function paneSessionIds(pane: TerminalPaneLayout): string[] {
  return 'sessionId' in pane
    ? [pane.sessionId]
    : [...paneSessionIds(pane.first), ...paneSessionIds(pane.second)];
}

function flushPendingPaneSyncs(): void {
  for (const [id, pending] of pendingPaneSyncs) {
    const viewers = windowGroups.viewers(id);
    if (!viewers || viewers.size < 2) {
      pendingPaneSyncs.delete(id);
      continue;
    }
    const sessions = paneSessionIds(pending.pane).map((sessionId) => {
      if (projections.has(sessionId)) {
        return { sessionId, owner: pending.requestor, projection: true as const };
      }
      const owner = realOwnerOf(pending.requestor, sessionId);
      return owner && hostFor(owner)?.has(sessionId)
        ? { sessionId, owner, projection: false as const }
        : undefined;
    });
    if (sessions.some((session) => session === undefined)) continue;
    windowGroups.setDocument(id, paneSessionIds(pending.pane));
    for (const session of sessions) {
      if (!session || session.projection) continue;
      paneSessionViewers.set(session.sessionId, new Set(viewers.keys()));
      for (const [viewer] of viewers) {
        if (viewer !== session.owner && !isMirrorWindow(viewer, session.sessionId)) {
          registerMirror(session.owner, viewer, session.sessionId);
        }
      }
    }
    const document = {
      pane: pending.pane,
      revision: (paneDocuments.get(id)?.revision ?? 0) + 1,
      origin: String(pending.requestor.id),
      viewers: new Set(viewers.keys()),
    };
    paneDocuments.set(id, document);
    for (const [viewer] of viewers) {
      if (!viewer.isDestroyed()) {
        onPane(viewer, id, document.pane, document.revision, document.origin);
      }

    }
    pendingPaneSyncs.delete(id);
  }
}

function isAuthorizedPaneViewer(window: BrowserWindow, sessionId: string): boolean {
  if (paneSessionViewers.get(sessionId)?.has(window)) return true;
  for (const document of paneDocuments.values()) {
    if (document.viewers.has(window) && paneSessionIds(document.pane).includes(sessionId)) return true;
  }
  return false;
}

/** Marks `recipient` as a copy-viewer of `owner`'s session, attached lazily. */
function registerMirror(owner: BrowserWindow, recipient: BrowserWindow, id: string): void {
  const ids = mirrorIds.get(recipient) ?? new Set<string>();
  ids.add(id);
  mirrorIds.set(recipient, ids);
  if (!mirrorHooked.has(recipient)) {
    mirrorHooked.add(recipient);
    recipient.once('closed', () => forgetMirrorWindow(recipient));
  }
}

/** Attaches a registered mirror's actual output subscription, on its first spawn. */
function attachMirror(owner: BrowserWindow, recipient: BrowserWindow, request: PtySpawnRequest): void {
  const realHost = hostFor(owner);
  if (!realHost) return;
  const bySession = mirrorDetachers.get(request.id) ?? new Map<BrowserWindow, () => void>();
  bySession.get(recipient)?.();
  const detach = realHost.mirror(request.id, {
    onData: (chunk) => emit(recipient, request.id, chunk),
    onExit: (exitCode) => {
      onExit(recipient, request.id, exitCode);
      detachMirror(request.id, recipient);
    },
  });
  if (!detach) return;
  bySession.set(recipient, detach);
  mirrorDetachers.set(request.id, bySession);
  trackViewerSize(request.id, recipient, request.cols, request.rows);
  if ((windowGroups.viewers(request.id)?.size ?? 0) > 1) reconcileSharedSize(request.id, owner);
}

/**
 * Open a shell for a window.
 *
 * A request that arrives without a window is dropped. Nothing would reap the
 * session, and an unreapable shell is a process the user cannot see and did
 * not ask to keep.
 */
function spawn(
  owner: BrowserWindow | undefined,
  rawRequest: PtySpawnRequest,
  requireReservation: boolean,
): void {
  if (!owner) return;
  const { cols, rows } = clampTerminalGrid(rawRequest.cols, rawRequest.rows);
  const request = cols === rawRequest.cols && rows === rawRequest.rows
    ? rawRequest
    : { ...rawRequest, cols, rows };
  if (projections.has(request.id)) {
    prepareProjectionOwner(owner);
    projections.attach(owner, {
      sessionId: request.id,
      projectionId: windowProjectionId(owner, request.id),
      cols: request.cols,
      rows: request.rows,
    });
    trackViewerSize(request.id, owner, request.cols, request.rows);
    flushPendingPaneSyncs();
    const epoch = projections.focus(
      owner,
      request.id,
      windowProjectionId(owner, request.id),
      request.cols,
      request.rows,
    );
    if (epoch !== undefined) {
      const epochs = projectionEpochs.get(owner) ?? new Map<string, number>();
      epochs.set(request.id, epoch);
      projectionEpochs.set(owner, epochs);
    }
    return;
  }
  if (isMirrorWindow(owner, request.id)) {
    const realOwner = sessionOwner.get(request.id);
    if (realOwner) attachMirror(realOwner, owner, request);
    return;
  }
  const paneOwner = sessionOwner.get(request.id);
  if (paneOwner && paneOwner !== owner) {
    if (!isAuthorizedPaneViewer(owner, request.id)) {
      throw new Error(`Terminal session ${request.id} is not authorized for this window.`);
    }
    registerMirror(paneOwner, owner, request.id);
    attachMirror(paneOwner, owner, request);
    return;
  }
  const reserved = launcher.take(owner, request.id);
  const host = hostFor(owner);
  if (requireReservation && !reserved && !host?.list().some((session) => session.id === request.id)) {
    throw new Error(`Terminal session ${request.id} is not reserved for this window.`);
  }
  (host ?? hosts.for(owner)).spawn(
    reserved
      ? { ...request, shell: reserved.command, cwd: reserved.cwd, args: reserved.args, env: reserved.env }
      : request,
  );
  sessionOwner.set(request.id, owner);
  trackViewerSize(request.id, owner, request.cols, request.rows);
  flushPendingPaneSyncs();
}

/** Open a terminal from a trusted embedder-owned request. */
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

/** Move a live local PTY to another BrowserWindow without restarting it. */
export function transferPty(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  rawRequest: PtySpawnRequest,
): boolean {
  if (!owner || !recipient || owner === recipient) return false;
  const realOwner = realOwnerOf(owner, rawRequest.id);
  if (!realOwner || realOwner === recipient) return false;
  const { cols, rows } = clampTerminalGrid(rawRequest.cols, rawRequest.rows);
  const request = cols === rawRequest.cols && rows === rawRequest.rows
    ? rawRequest
    : { ...rawRequest, cols, rows };
  const recipientWasMirror = isMirrorWindow(recipient, request.id);
  const source = hostFor(realOwner);
  const destination = hosts.for(recipient);
  const moved = source?.transfer(request.id, destination, request) ?? false;
  if (moved) {
    if (recipientWasMirror) detachMirror(request.id, recipient, true);
    sessionOwner.set(request.id, recipient);
    windowGroups.removeViewer(request.id, realOwner);
    trackViewerSize(request.id, recipient, request.cols, request.rows);
    reconcileSharedSize(request.id, recipient);
  }
  return moved;
}

/**
 * Add `recipient` as a second, live window for a session `owner` already
 * holds, without moving the process or disturbing `owner`'s own view.
 *
 * Used for "Copy into New Window": both windows keep working, live, off the
 * same shell, the same way a second tmux client would.
 */
export function copyPty(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  request: PtySpawnRequest,
): boolean {
  if (!owner || !recipient || owner === recipient) return false;
  const realOwner = realOwnerOf(owner, request.id);
  if (!realOwner || !hostFor(realOwner)?.has(request.id)) return false;
  windowGroups.registerViewer(request.id, recipient);
  registerMirror(realOwner, recipient, request.id);
  return true;
}

/**
 * Copy a complete terminal document into another window.
 *
 * Direct PTYs register a mirror while durable projections grant an independent
 * attachment. A failed member revokes every capability already granted.
 */
export function copyPtyOwnership(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  requests: readonly PtySpawnRequest[],
): boolean {
  return stagePtyOwnership(owner, recipient, requests, 'copy')?.commit() ?? false;
}

export interface PtyOwnershipTransaction {
  commit(): boolean;
  rollback(): void;
}

interface StagedPtyOwnership {
  request: PtySpawnRequest;
  projection: boolean;
  recipientWasMirror: boolean;
}

/**
 * Stage a complete terminal document for another window.
 *
 * The destination receives projection grants or direct PTY mirrors so its
 * renderer can become usable while the source remains fully attached. Commit
 * moves authority for `move` transactions; rollback removes only destination
 * capabilities.
 */
export function stagePtyOwnership(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  requests: readonly PtySpawnRequest[],
  mode: 'copy' | 'move',
): PtyOwnershipTransaction | undefined {
  if (!owner || !recipient || owner === recipient || requests.length === 0) return undefined;
  if (new Set(requests.map(({ id }) => id)).size !== requests.length) return undefined;
  const staged: StagedPtyOwnership[] = [];

  const rollbackDestination = (): void => {
    for (const entry of [...staged].reverse()) {
      if (entry.projection) {
        projections.detachOwner(recipient, entry.request.id);
        projections.revoke(owner, entry.request.id, recipient);
        projectionEpochs.get(recipient)?.delete(entry.request.id);
        forgetViewerSize(entry.request.id, recipient);
      } else if (!entry.recipientWasMirror) {
        detachMirror(entry.request.id, recipient);
      }
    }
  };

  for (const request of requests) {
    if (projections.has(request.id)) {
      if (!grantPtyProjection(owner, request.id, recipient, request.cols, request.rows)) {
        rollbackDestination();
        return undefined;
      }
      staged.push({
        request,
        projection: true,
        recipientWasMirror: false,
      });
      continue;
    }
    const recipientWasMirror = isMirrorWindow(recipient, request.id);
    if (!copyPty(owner, recipient, request)) {
      rollbackDestination();
      return undefined;
    }
    staged.push({
      request,
      projection: false,
      recipientWasMirror,
    });
  }

  let finished = false;
  return {
    commit(): boolean {
      if (finished) return false;
      if (mode === 'copy') {
        finished = true;
        return true;
      }

      const moved: Array<{
        entry: StagedPtyOwnership;
        realOwner?: BrowserWindow;
        sourceGrid?: { cols: number; rows: number };
      }> = [];
      for (const entry of staged) {
        if (entry.projection) {
          if (!projections.transfer(owner, entry.request.id, recipient)) {
            for (const prior of [...moved].reverse()) {
              if (prior.entry.projection) {
                projections.transfer(recipient, prior.entry.request.id, owner);
              } else if (prior.realOwner) {
                transferPty(recipient, prior.realOwner, {
                  ...prior.entry.request,
                  cols: prior.sourceGrid?.cols ?? prior.entry.request.cols,
                  rows: prior.sourceGrid?.rows ?? prior.entry.request.rows,
                });
              }
            }
            rollbackDestination();
            finished = true;
            return false;
          }
          moved.push({ entry });
          continue;
        }

        const realOwner = realOwnerOf(owner, entry.request.id);
        const sourceGrid = realOwner
          ? windowGroups.viewers(entry.request.id)?.get(realOwner)
          : undefined;
        if (!realOwner || !transferPty(owner, recipient, entry.request)) {
          for (const prior of [...moved].reverse()) {
            if (prior.entry.projection) {
              projections.transfer(recipient, prior.entry.request.id, owner);
            } else if (prior.realOwner) {
              transferPty(recipient, prior.realOwner, {
                ...prior.entry.request,
                cols: prior.sourceGrid?.cols ?? prior.entry.request.cols,
                rows: prior.sourceGrid?.rows ?? prior.entry.request.rows,
              });
            }
          }
          rollbackDestination();
          finished = true;
          return false;
        }
        moved.push({ entry, realOwner, sourceGrid });
      }

      for (const entry of staged) {
        if (!entry.projection) continue;
        projections.revoke(recipient, entry.request.id, recipient);
        projections.detachOwner(owner, entry.request.id);
        projectionEpochs.get(owner)?.delete(entry.request.id);
        forgetViewerSize(entry.request.id, owner);
        trackViewerSize(
          entry.request.id,
          recipient,
          entry.request.cols,
          entry.request.rows,
        );
      }
      finished = true;
      return true;
    },
    rollback(): void {
      if (finished) return;
      rollbackDestination();
      finished = true;
    },
  };
}

/**
 * Move a complete terminal document to another window immediately.
 *
 * Callers that must wait for renderer readiness should use
 * `stagePtyOwnership` and commit only after the destination is usable.
 */
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
  pendingPaneSyncs.set(id, { requestor: owner, pane });
  flushPendingPaneSyncs();
}

/** Renderer-visible summaries. Executable profile settings never leave main. */
export function listTerminalProfiles(owner: BrowserWindow | undefined): TerminalProfileSummary[] {
  if (!owner) return [];
  prepareLauncher(owner);
  return [...launcher.profiles()];
}

export async function discoverTerminalTargets(
  owner: BrowserWindow | undefined,
): Promise<TerminalDiscovery> {
  if (!owner) return { generation: 0, targets: [] };
  prepareLauncher(owner);
  return launcher.discover(owner);
}

export function launchTerminal(
  owner: BrowserWindow | undefined,
  request: TerminalLaunchRequest,
): TerminalLaunchResult {
  if (!owner) throw new Error('Terminal launch has no owning window.');
  prepareLauncher(owner);
  const result = launcher.launch(owner, request);
  const reserved = launcher.take(owner, result.sessionId);
  if (!reserved) throw new Error('Terminal launch reservation was unavailable.');
  if (reserved.tmuxControl) {
    const sessions = controlHosts.for(owner);
    const host = new TmuxControlHost({
      emit: (chunk) => emit(owner, result.sessionId, chunk),
      onExit: (exitCode) => onExit(owner, result.sessionId, exitCode),
    });
    sessions.set(result.sessionId, host);
    return result;
  }
  if (reserved.tmuxProjection) {
    prepareProjectionOwner(owner);
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
  sessionOwner.set(result.sessionId, owner);
  trackViewerSize(result.sessionId, owner, request.cols, request.rows);
  flushPendingPaneSyncs();
  return result;
}

export function writePty(
  owner: BrowserWindow | undefined,
  id: string,
  data: string,
): void {
  if (owner) {
    const epoch = projectionEpochs.get(owner)?.get(id);
    if (projections.has(id) && epoch !== undefined) {
      projections.write(owner, id, windowProjectionId(owner, id), epoch, data);
      return;
    }
  }
  if (owner) controlHosts.get(owner)?.get(id)?.write(data);
  const realOwner = owner ? realOwnerOf(owner, id) : owner;
  hostFor(realOwner)?.write(id, data);
}

export function resizePty(
  owner: BrowserWindow | undefined,
  id: string,
  requestedCols: number,
  requestedRows: number,
): void {
  const { cols, rows } = clampTerminalGrid(requestedCols, requestedRows);
  if (owner) {
    const epoch = projectionEpochs.get(owner)?.get(id);
    if (projections.has(id) && epoch !== undefined) {
      projections.resize(owner, id, windowProjectionId(owner, id), epoch, cols, rows);
      return;
    }
  }
  if (owner) controlHosts.get(owner)?.get(id)?.resize(cols, rows);
  const realOwner = owner ? realOwnerOf(owner, id) : owner;
  const appliedEcho = owner ? trackViewerSize(id, owner, cols, rows) : false;
  if (appliedEcho && owner) {
    const canonical = windowGroups.canonical(id);
    if (canonical) onSize(owner, id, canonical.grid.cols, canonical.grid.rows);
    return;
  }
  const sizes = windowGroups.viewers(id);
  if (sizes && sizes.size > 1 && realOwner && owner) {
    reconcileSharedSize(id, realOwner, owner);
    return;
  }
  hostFor(realOwner)?.resize(id, cols, rows);
}

export function attachPtyProjection(
  owner: BrowserWindow | undefined,
  request: PtyProjectionAttachRequest,
): boolean {
  if (!owner) return false;
  prepareProjectionOwner(owner);
  const { cols, rows } = clampTerminalGrid(request.cols, request.rows);
  return projections.attach(owner, {
    sessionId: request.id,
    projectionId: request.projectionId,
    cols,
    rows,
  });
}

export function focusPtyProjection(
  owner: BrowserWindow | undefined,
  request: PtyProjectionAttachRequest,
): number | undefined {
  if (!owner) return undefined;
  const { cols, rows } = clampTerminalGrid(request.cols, request.rows);
  return projections.focus(
    owner,
    request.id,
    request.projectionId,
    cols,
    rows,
  );
}

export function writePtyProjection(
  owner: BrowserWindow | undefined,
  request: PtyProjectionWriteRequest,
): boolean {
  if (!owner) return false;
  return projections.write(
    owner,
    request.id,
    request.projectionId,
    request.epoch,
    request.data,
  ) ?? false;
}

export function resizePtyProjection(
  owner: BrowserWindow | undefined,
  request: PtyProjectionResizeRequest,
): boolean {
  if (!owner) return false;
  const { cols, rows } = clampTerminalGrid(request.cols, request.rows);
  return projections.resize(
    owner,
    request.id,
    request.projectionId,
    request.epoch,
    cols,
    rows,
  ) ?? false;
}

export function detachPtyProjection(
  owner: BrowserWindow | undefined,
  id: string,
  projectionId: string,
): boolean {
  if (!owner || !projections.detach(owner, id, projectionId)) return false;
  forgetViewerSize(id, owner);
  return true;
}

/** Authorize one destination window to attach its next projection. */
export function grantPtyProjection(
  owner: BrowserWindow | undefined,
  id: string,
  recipient: BrowserWindow | undefined,
  cols = 80,
  rows = 24,
): boolean {
  if (!owner || !recipient) return false;
  prepareProjectionOwner(recipient);
  const granted = projections.grant(owner, id, recipient);
  if (granted) trackViewerSize(id, recipient, cols, rows);
  return granted;
}

/** Move projection authority to a destination window and detach the old view. */
export function transferPtyProjection(
  owner: BrowserWindow | undefined,
  id: string,
  recipient: BrowserWindow | undefined,
  cols = 80,
  rows = 24,
): boolean {
  if (!owner || !recipient) return false;
  prepareProjectionOwner(recipient);
  if (!projections.transfer(owner, id, recipient)) return false;
  projections.detachOwner(owner, id);
  projectionEpochs.get(owner)?.delete(id);
  forgetViewerSize(id, owner);
  trackViewerSize(id, recipient, cols, rows);
  return true;
}

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
    projectionEpochs.get(owner)?.delete(id);
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

/** This window's live sessions, including any no view is showing. */
export function listPtys(owner: BrowserWindow | undefined): TerminalSession[] {
  return hostFor(owner)?.list() ?? [];
}

/** Kill every window's sessions. Call on quit, so no shell outlives the app. */
export function killAllPtys(): void {
  hosts.releaseAll();
  controlHosts.releaseAll();
  projections.abandonAll();
}
