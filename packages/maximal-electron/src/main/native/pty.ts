import { app, type BrowserWindow } from 'electron';

import { TerminalHost, type TerminalSession } from '../../host/terminal-host.js';
import type { PtySpawnRequest } from '../../shared/ipc.js';

import { Owners } from './pty-session.js';

/**
 * Pseudo-terminal sessions, one manager per window.
 *
 * The shell runs here, in the main process. The renderer holds a `ghostty-web`
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
type Emit = (owner: BrowserWindow, id: string, chunk: string) => void;
type Exit = (owner: BrowserWindow, id: string, exitCode: number) => void;

let emit: Emit = () => undefined;
let onExit: Exit = () => undefined;

export function configurePty(handlers: { emit: Emit; onExit: Exit }): void {
  emit = handlers.emit;
  onExit = handlers.onExit;
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
      // Programs read this to name the terminal they are running under.
      env: { TERM_PROGRAM: 'Stuffbucket' },
      emit: (id, chunk) => {
        emit(owner, id, chunk);
      },
      onExit: (id, exitCode) => {
        onExit(owner, id, exitCode);
      },
    });
  },
  (host) => {
    host.terminateAll();
  },
);

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
export function spawnPty(
  owner: BrowserWindow | undefined,
  request: PtySpawnRequest,
): void {
  if (!owner) return;
  hosts.for(owner).spawn(request);
}

export function writePty(
  owner: BrowserWindow | undefined,
  id: string,
  data: string,
): void {
  hostFor(owner)?.write(id, data);
}

export function resizePty(
  owner: BrowserWindow | undefined,
  id: string,
  cols: number,
  rows: number,
): void {
  hostFor(owner)?.resize(id, cols, rows);
}

export function killPty(owner: BrowserWindow | undefined, id: string): void {
  hostFor(owner)?.terminate(id);
}

/** This window's live sessions, including any no view is showing. */
export function listPtys(owner: BrowserWindow | undefined): TerminalSession[] {
  return hostFor(owner)?.list() ?? [];
}

/** Kill every window's sessions. Call on quit, so no shell outlives the app. */
export function killAllPtys(): void {
  hosts.releaseAll();
}
