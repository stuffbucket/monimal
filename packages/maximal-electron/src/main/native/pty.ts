import { app, type BrowserWindow } from 'electron';

import {
  TerminalHost,
  TmuxProjectionOwners,
  type TerminalSession,
  type TerminalStatus,
} from '../../host/terminal-host.js';
import type {
  PtyProjectionAttachRequest,
  PtyProjectionResizeRequest,
  PtyProjectionWriteRequest,
  PtySpawnRequest,
  PtyStatus,
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

/** Emit batched output, and the end of a session, to the owning window. */
type Emit = (owner: BrowserWindow, id: string, chunk: string, sequence?: number, projectionId?: string) => void;
type Exit = (owner: BrowserWindow, id: string, exitCode: number, projectionId?: string) => void;
type Status = (owner: BrowserWindow, status: PtyStatus) => void;
/** Tell one window the authoritative size a mirrored session settled on. */
type Size = (window: BrowserWindow, id: string, cols: number, rows: number) => void;
type Pane = (window: BrowserWindow, id: string, pane: TerminalPaneLayout) => void;

let emit: Emit = () => undefined;
let onExit: Exit = () => undefined;
let onStatus: Status = () => undefined;
let onSize: Size = () => undefined;
let onPane: Pane = () => undefined;

export function configurePty(
  handlers: { emit: Emit; onExit: Exit; onStatus: Status; onSize?: Size; onPane?: Pane },
): void {
  emit = handlers.emit;
  onExit = handlers.onExit;
  onStatus = handlers.onStatus;
  onSize = handlers.onSize ?? (() => undefined);
  onPane = handlers.onPane ?? (() => undefined);
}

function ptyStatus(status: TerminalStatus): PtyStatus {
  return status;
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
    // A destroyed window can no longer be asked to clean up, so its own
    // destruction is what ends its sessions.
    owner.once('closed', () => {
      for (const [id, sessionOwnerWindow] of sessionOwner) {
        if (sessionOwnerWindow === owner) sessionOwner.delete(id);
      }
      hosts.release(owner);
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
        onStatus(owner, ptyStatus(status));
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
  terminate: (command, args) => {
    void execFileRunner(command, args, { timeout: 2_000, maxBuffer: 64 * 1024 }).catch(() => undefined);
  },
  emit: (owner, sessionId, projectionId, chunk) => emit(owner, sessionId, chunk, undefined, projectionId),
  onExit: (owner, sessionId, projectionId, exitCode) => onExit(owner, sessionId, exitCode, projectionId),
});

function prepareProjectionOwner(owner: BrowserWindow): void {
  if (projectionOwners.has(owner)) return;
  projectionOwners.add(owner);
  owner.once('closed', () => projections.release(owner));
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

/** The window actually holding the process, following a mirror to its owner. */
function realOwnerOf(window: BrowserWindow, id: string): BrowserWindow | undefined {
  return isMirrorWindow(window, id) ? sessionOwner.get(id) : window;
}

function detachMirror(id: string, recipient: BrowserWindow): void {
  const bySession = mirrorDetachers.get(id);
  bySession?.get(recipient)?.();
  bySession?.delete(recipient);
  if (bySession && bySession.size === 0) mirrorDetachers.delete(id);
  mirrorIds.get(recipient)?.delete(id);
  forgetViewerSize(id, recipient);
}

function forgetMirrorWindow(window: BrowserWindow): void {
  const ids = mirrorIds.get(window);
  if (!ids) return;
  for (const id of [...ids]) detachMirror(id, window);
  mirrorIds.delete(window);
  for (const viewers of paneSessionViewers.values()) viewers.delete(window);
}

/*
 * A shared session has exactly one real PTY but as many windows watching it
 * as it has viewers (its owner plus every mirror). `viewerSizes` remembers
 * each viewer's last-requested size; `appliedSize` remembers what the real
 * PTY was last resized to, so a viewer joining or resizing does not force a
 * redundant `resize()` call when nothing actually changed.
 *
 * When a viewer joins or leaves, there is no single window the user is
 * actively resizing, so the safe default is the smallest live viewer (tmux's
 * own "smallest client wins" rule for a shared session), which never grows a
 * window past what every other viewer can already show.
 *
 * When a *live* viewer resizes, though, taking the smallest would silently
 * revert the very action the user just took -- shrinking the window they
 * were dragging back to whatever the other, untouched window happens to be.
 * `resizePty()` passes that viewer as `requestor` instead: its own size
 * becomes authoritative, the real PTY follows it, and every *other* viewer is
 * asked (`matchWindowToGrid`, best-effort) to physically resize its own
 * window to match, rather than being left at its old size with its
 * emulator's grid merely clamped inside it. `pty:size` still broadcasts to
 * every viewer regardless, so one that cannot be physically resized (or
 * whose resize has not landed yet) still keeps its grid correct.
 */
const viewerSizes = new Map<string, Map<BrowserWindow, { cols: number; rows: number }>>();
const appliedSize = new Map<string, { cols: number; rows: number }>();
const pendingPaneSyncs = new Map<string, {
  requestor: BrowserWindow;
  pane: TerminalPaneLayout;
}>();

/**
 * The grid `matchWindowToGrid` is physically resizing a window *to*, keyed
 * by session and window, recorded the moment the resize is issued rather
 * than after it lands.
 *
 * Physically resizing a window's OS content area is itself observed by
 * that window's own renderer (its `ResizeObserver` reacts to the new pixel
 * size) and reported back through the very same `resizePty` a genuine
 * user-driven resize uses. Without distinguishing the two, that echo would
 * look like a fresh, independently authoritative resize from that window,
 * scheduling another reconcile that could physically resize the others
 * again -- including back toward this window's *old* size if their own
 * echoes race back first -- an oscillation that never settles because each
 * round trip clears the debounce window before the next one arrives.
 * Recognizing "this resize came back reporting exactly the grid we just
 * asked this window to reach" lets `resizePty` treat it as confirmation,
 * not a new request.
 */
const expectedGridAfterMatch = new Map<string, Map<BrowserWindow, { cols: number; rows: number }>>();

/**
 * When several windows resize a shared session at nearly the same moment
 * (for example three OS-level `setSize` calls issued back to back), each
 * arrives as its own `resizePty` call. Reconciling every one immediately
 * would make each requestor's call briefly authoritative and physically
 * resize the others to match it, only for the next requestor's call (or
 * the ResizeObserver echo from that very physical resize) to immediately
 * overwrite it again -- an oscillation that can outlast the caller's
 * patience. Coalescing to the last requestor seen within a short quiet
 * window, the same way the renderer already coalesces its own resizes to
 * one per frame (see `TerminalResizes`), settles on a single authoritative
 * size per burst instead.
 */
const RECONCILE_DEBOUNCE_MS = 60;
const pendingReconciles = new Map<string, { realOwner: BrowserWindow; requestor: BrowserWindow; timer: NodeJS.Timeout }>();

function scheduleReconcile(id: string, realOwner: BrowserWindow, requestor: BrowserWindow): void {
  const pending = pendingReconciles.get(id);
  if (pending) clearTimeout(pending.timer);
  const timer = setTimeout(() => {
    pendingReconciles.delete(id);
    reconcileSharedSize(id, realOwner, requestor);
  }, RECONCILE_DEBOUNCE_MS);
  pendingReconciles.set(id, { realOwner, requestor, timer });
}

function trackViewerSize(id: string, window: BrowserWindow, cols: number, rows: number): void {
  const sizes = viewerSizes.get(id) ?? new Map<BrowserWindow, { cols: number; rows: number }>();
  sizes.set(window, clampTerminalGrid(cols, rows));
  viewerSizes.set(id, sizes);
}

function smallestOf(sizes: Map<BrowserWindow, { cols: number; rows: number }>): { cols: number; rows: number } {
  let cols = Infinity;
  let rows = Infinity;
  for (const size of sizes.values()) {
    cols = Math.min(cols, size.cols);
    rows = Math.min(rows, size.rows);
  }
  return { cols, rows };
}

/**
 * Narrows an isolated-world measurement result to the shape this module's
 * measurement helpers expect, since that call is typed `Promise<any>`
 * regardless of what the injected script actually returns.
 */
function asRect(value: unknown): { width: number; height: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { width, height } = value as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;
  return { width, height };
}

/**
 * Measures `id`'s terminal container's own current CSS pixel size inside
 * `window`, run in an isolated world rather than through
 * `executeJavaScript()`, because this app's renderers ship a `script-src`
 * CSP with no `'unsafe-eval'`: an isolated world is a separate script realm
 * from the page's own, so it is not subject to the page's CSP, while still
 * sharing the same DOM the page renders into. `getBoundingClientRect()` is
 * native DOM state (not a JS expando like the emulator instance stashed on
 * the element), so it reads correctly across worlds.
 *
 * Any failure -- a destroyed window, an unmounted or hidden terminal (for
 * example a background tab in a multi-tab window) -- resolves to
 * `undefined`; callers treat that as "give up on this window".
 */
const MEASUREMENT_WORLD_ID = 918_273;

async function measureContainerRect(
  window: BrowserWindow, id: string,
): Promise<{ width: number; height: number } | undefined> {
  if (window.isDestroyed()) return undefined;
  const code = `(() => {
    const el = document.querySelector('[data-session-id="' + ${JSON.stringify(id)} + '"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  })()`;
  try {
    const raw: unknown = await window.webContents.executeJavaScriptInIsolatedWorld(MEASUREMENT_WORLD_ID, [{ code }]);
    return window.isDestroyed() ? undefined : asRect(raw);
  } catch {
    return undefined;
  }
}

/**
 * Best-effort: physically resizes `window` so its terminal container
 * reaches `cols`/`rows` exactly, using a cell size measured from a
 * different, already-known-good window (`cellWidth`/`cellHeight`, from the
 * live viewer whose resize is authoritative) rather than from `window`
 * itself.
 *
 * That distinction matters: `reconcileSharedSize` also broadcasts a
 * synchronous `pty:size` clamp to every viewer, including this one, and
 * that clamp is what the renderer actually applies its own grid from. By
 * the time this async measurement resolves, `window`'s own grid may
 * already equal the target one -- which would make a cell size derived
 * from `window`'s own (rect ÷ grid) trivially self-consistent (rect ÷
 * already-target-grid always reproduces a "no resize needed" answer)
 * even when `window` is still the wrong physical size. Using the
 * requestor's cell size instead avoids that trap.
 *
 * `window`'s own rect is still measured, once, to compute its chrome (the
 * part of its content area the terminal container doesn't cover -- tab
 * strip, borders, and so on), which is assumed fixed-size and carried over
 * unchanged to the new content size.
 */
async function matchWindowToGrid(
  window: BrowserWindow, id: string, cols: number, rows: number, cellWidth: number, cellHeight: number,
  requestorChrome?: { chromeWidth: number; chromeHeight: number; contentWidth: number; contentHeight: number },
): Promise<void> {
  const rect = await measureContainerRect(window, id);
  if (!rect || window.isDestroyed()) return;
  const [currentWidth = 0, currentHeight = 0] = window.getContentSize();
  const chromeWidth = currentWidth - rect.width;
  const chromeHeight = currentHeight - rect.height;
  let targetWidth = Math.round(cols * cellWidth + chromeWidth);
  let targetHeight = Math.round(rows * cellHeight + chromeHeight);
  // When this window's own chrome (tab strip, borders, and so on) is
  // effectively the same size as the requestor's, copy the requestor's own
  // physical content size verbatim instead of recomputing a target from
  // (possibly slightly noisy) independent rect measurements. Two windows
  // that are otherwise structurally identical should land on *exactly* the
  // same pixel size, not one that merely rounds to the same grid -- small
  // float/measurement drift between windows can otherwise leave them a few
  // pixels apart even though their cols/rows already agree.
  if (
    requestorChrome
    && Math.abs(chromeWidth - requestorChrome.chromeWidth) <= 2
    && Math.abs(chromeHeight - requestorChrome.chromeHeight) <= 2
  ) {
    targetWidth = requestorChrome.contentWidth;
    targetHeight = requestorChrome.contentHeight;
  }
  if (Math.abs(targetWidth - currentWidth) <= 1 && Math.abs(targetHeight - currentHeight) <= 1) return;
  const expected = expectedGridAfterMatch.get(id) ?? new Map<BrowserWindow, { cols: number; rows: number }>();
  expected.set(window, { cols, rows });
  expectedGridAfterMatch.set(id, expected);
  window.setContentSize(Math.max(200, targetWidth), Math.max(150, targetHeight));
}

/**
 * Resizes the real PTY and tells every viewer.
 *
 * With no `requestor` (a viewer joining or leaving), the authoritative size
 * is the smallest live viewer. With one (a live viewer's own resize), that
 * viewer's own size is authoritative instead, and every other viewer is
 * asked to physically grow or shrink to match it, using the requestor's own
 * measured cell size (see `matchWindowToGrid`'s doc comment for why it must
 * be the requestor's, not each viewer's own).
 */
function reconcileSharedSize(id: string, realOwner: BrowserWindow, requestor?: BrowserWindow): void {
  const sizes = viewerSizes.get(id);
  if (!sizes || sizes.size === 0) return;
  const { cols, rows } = (requestor && sizes.get(requestor)) || smallestOf(sizes);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
  const last = appliedSize.get(id);
  if (last?.cols === cols && last?.rows === rows) return;
  appliedSize.set(id, { cols, rows });
  hostFor(realOwner)?.resize(id, cols, rows);
  for (const [window] of sizes) {
    if (!window.isDestroyed()) onSize(window, id, cols, rows);
  }
  if (requestor && !requestor.isDestroyed()) {
    void (async () => {
      const rect = await measureContainerRect(requestor, id);
      if (!rect) return;
      const cellWidth = rect.width / cols;
      const cellHeight = rect.height / rows;
      if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) return;
      const [requestorContentWidth = 0, requestorContentHeight = 0] = requestor.getContentSize();
      const requestorChrome = {
        chromeWidth: requestorContentWidth - rect.width,
        chromeHeight: requestorContentHeight - rect.height,
        contentWidth: requestorContentWidth,
        contentHeight: requestorContentHeight,
      };
      for (const [window] of sizes) {
        if (window === requestor || window.isDestroyed()) continue;
        void matchWindowToGrid(window, id, cols, rows, cellWidth, cellHeight, requestorChrome);
      }
    })();
  }
}

/** Drops one viewer's size entry, restoring the rest once it is gone. */
function forgetViewerSize(id: string, window: BrowserWindow): void {
  const sizes = viewerSizes.get(id);
  if (!sizes || !sizes.delete(window)) return;
  expectedGridAfterMatch.get(id)?.delete(window);
  if (sizes.size === 0) {
    viewerSizes.delete(id);
    appliedSize.delete(id);
    return;
  }
  const realOwner = sessionOwner.get(id);
  if (realOwner) reconcileSharedSize(id, realOwner);
}

/** Drops every size-tracking entry for a session that has fully exited. */
function forgetSessionSize(id: string): void {
  viewerSizes.delete(id);
  appliedSize.delete(id);
  pendingPaneSyncs.delete(id);
  paneSessionViewers.delete(id);
  expectedGridAfterMatch.delete(id);
  const pending = pendingReconciles.get(id);
  if (pending) {
    clearTimeout(pending.timer);
    pendingReconciles.delete(id);
  }
}

function paneSessionIds(pane: TerminalPaneLayout): string[] {
  return 'sessionId' in pane
    ? [pane.sessionId]
    : [...paneSessionIds(pane.first), ...paneSessionIds(pane.second)];
}

function flushPendingPaneSyncs(): void {
  for (const [id, pending] of pendingPaneSyncs) {
    const viewers = viewerSizes.get(id);
    if (!viewers || viewers.size < 2) {
      pendingPaneSyncs.delete(id);
      continue;
    }
    const sessions = paneSessionIds(pending.pane).map((sessionId) => {
      const owner = realOwnerOf(pending.requestor, sessionId);
      return owner && hostFor(owner)?.has(sessionId) ? { sessionId, owner } : undefined;
    });
    if (sessions.some((session) => session === undefined)) continue;
    for (const session of sessions) {
      if (!session) continue;
      paneSessionViewers.set(session.sessionId, new Set(viewers.keys()));
      for (const [viewer] of viewers) {
        if (viewer !== session.owner && !isMirrorWindow(viewer, session.sessionId)) {
          registerMirror(session.owner, viewer, session.sessionId);
        }
      }
    }
    for (const [viewer] of viewers) {
      if (!viewer.isDestroyed()) onPane(viewer, id, pending.pane);
    }
    pendingPaneSyncs.delete(id);
  }
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
  if ((viewerSizes.get(request.id)?.size ?? 0) > 1) reconcileSharedSize(request.id, owner);
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
      projectionId: request.id,
      cols: request.cols,
      rows: request.rows,
    });
    const epoch = projections.focus(owner, request.id, request.id, request.cols, request.rows);
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
  if (paneOwner && paneOwner !== owner && paneSessionViewers.get(request.id)?.has(owner)) {
    registerMirror(paneOwner, owner, request.id);
    attachMirror(paneOwner, owner, request);
    return;
  }
  const reserved = launcher.take(owner, request.id);
  const host = hostFor(owner);
  if (requireReservation && !reserved && !host?.list().some((session) => session.id === request.id)) {
    throw new Error('Terminal session is not reserved for this window.');
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
  if (isMirrorWindow(recipient, request.id)) detachMirror(request.id, recipient);
  const source = hostFor(realOwner);
  const destination = hosts.for(recipient);
  const moved = source?.transfer(request.id, destination, request) ?? false;
  if (moved) {
    sessionOwner.set(request.id, recipient);
    viewerSizes.get(request.id)?.delete(realOwner);
    trackViewerSize(request.id, recipient, request.cols, request.rows);
    // `TerminalHost.transfer()` already resized the process to `request`,
    // bypassing `appliedSize`; forcing a fresh reconcile keeps that cache
    // (and any other viewer still watching this session) honest.
    appliedSize.delete(request.id);
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
  registerMirror(realOwner, recipient, request.id);
  return true;
}

export function syncPtyPane(
  owner: BrowserWindow | undefined,
  id: string,
  pane: TerminalPaneLayout,
): void {
  if (!owner || !viewerSizes.get(id)?.has(owner)) return;
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
      projections.write(owner, id, id, epoch, data);
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
      projections.resize(owner, id, id, epoch, cols, rows);
      return;
    }
  }
  if (owner) controlHosts.get(owner)?.get(id)?.resize(cols, rows);
  const realOwner = owner ? realOwnerOf(owner, id) : owner;
  if (owner) trackViewerSize(id, owner, cols, rows);
  if (owner) {
    const expected = expectedGridAfterMatch.get(id);
    const expectedForOwner = expected?.get(owner);
    if (expectedForOwner) expected?.delete(owner);
    if (
      expectedForOwner
      && Math.abs(expectedForOwner.cols - cols) <= 1
      && Math.abs(expectedForOwner.rows - rows) <= 1
    ) {
      // This is the `ResizeObserver` echo of a physical resize this module
      // itself just issued (see `expectedGridAfterMatch`'s doc comment),
      // confirming it landed rather than reporting a fresh, independently
      // authoritative resize from `owner`. Reconciling again from here
      // would let that echo become the new authoritative source and
      // physically resize the others yet again, an oscillation that never
      // settles. The comparison is off-by-one tolerant: a window's own
      // font/cell-size measurement can legitimately round to a grid one
      // column or row off from the exact target pixel size we asked for,
      // and treating that near-miss as a brand-new authoritative resize
      // (rather than the echo it actually is) is what let each window's
      // slightly different measurement noise keep nominating a new
      // "requestor" forever, sliding the whole group's target size around
      // instead of settling on one.
      return;
    }
  }
  const sizes = viewerSizes.get(id);
  if (sizes && sizes.size > 1 && realOwner && owner) {
    scheduleReconcile(id, realOwner, owner);
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
  return owner ? projections.detach(owner, id, projectionId) : false;
}

/** Authorize one destination window to attach its next projection. */
export function grantPtyProjection(
  owner: BrowserWindow | undefined,
  id: string,
  recipient: BrowserWindow | undefined,
): boolean {
  if (!owner || !recipient) return false;
  prepareProjectionOwner(recipient);
  return projections.grant(owner, id, recipient);
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
