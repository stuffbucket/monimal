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
} from '../../shared/ipc.js';
import {
  TerminalLauncher,
  loadTerminalProfiles,
  type TerminalDiscovery,
  type TerminalLaunchRequest,
  type TerminalLaunchResult,
  type TerminalProfileSummary,
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

let emit: Emit = () => undefined;
let onExit: Exit = () => undefined;
let onStatus: Status = () => undefined;

export function configurePty(handlers: { emit: Emit; onExit: Exit; onStatus: Status }): void {
  emit = handlers.emit;
  onExit = handlers.onExit;
  onStatus = handlers.onStatus;
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
  return owner ? hosts.get(owner) : undefined;
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
  request: PtySpawnRequest,
  requireReservation: boolean,
): void {
  if (!owner) return;
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
  hostFor(owner)?.write(id, data);
}

export function resizePty(
  owner: BrowserWindow | undefined,
  id: string,
  cols: number,
  rows: number,
): void {
  if (owner) {
    const epoch = projectionEpochs.get(owner)?.get(id);
    if (projections.has(id) && epoch !== undefined) {
      projections.resize(owner, id, id, epoch, cols, rows);
      return;
    }
  }
  if (owner) controlHosts.get(owner)?.get(id)?.resize(cols, rows);
  hostFor(owner)?.resize(id, cols, rows);
}

export function attachPtyProjection(
  owner: BrowserWindow | undefined,
  request: PtyProjectionAttachRequest,
): boolean {
  if (!owner) return false;
  prepareProjectionOwner(owner);
  return projections.attach(owner, {
    sessionId: request.id,
    projectionId: request.projectionId,
    cols: request.cols,
    rows: request.rows,
  });
}

export function focusPtyProjection(
  owner: BrowserWindow | undefined,
  request: PtyProjectionAttachRequest,
): number | undefined {
  if (!owner) return undefined;
  return projections.focus(
    owner,
    request.id,
    request.projectionId,
    request.cols,
    request.rows,
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
  return projections.resize(
    owner,
    request.id,
    request.projectionId,
    request.epoch,
    request.cols,
    request.rows,
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
