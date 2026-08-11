import { statSync } from 'node:fs';

import { spawn, type IPty } from 'node-pty';

import {
  append,
  cwdMessage,
  drain,
  emptyBuffer,
  emptyRetained,
  Generations,
  replay,
  resolveCwd,
  retain,
  type Buffered,
  type Retained,
} from '../main/native/pty-session.js';

/**
 * Pseudo-terminal sessions, for a consumer's main process.
 *
 * The shell process runs here rather than in the renderer, which is what lets
 * a renderer keep `sandbox: true`. A consumer wires these to whatever channels
 * they already have; nothing here knows about an IPC contract.
 *
 * This module imports no `electron`, so a consumer supplies the fallback
 * directory rather than it being read from `app.getPath('home')`.
 */

/** Emit batched output, and the end of a session. */
export interface TerminalHostHandlers {
  emit: (id: string, chunk: string) => void;
  onExit: (id: string, exitCode: number) => void;
}

export interface SpawnOptions {
  id: string;
  cols: number;
  rows: number;
  shell?: string;
  cwd?: string;
}

export interface TerminalHostOptions extends TerminalHostHandlers {
  /** Where a session starts when it names no directory, or names a bad one. */
  homeDirectory: string;
  /** The login shell, when a session names none. */
  defaultShell: string;
  /**
   * Coalesce output for this many milliseconds.
   *
   * A build log emits thousands of small writes per second. One message each
   * would swamp whatever channel carries them.
   */
  flushMs?: number;
  /**
   * Extra environment for every shell this manager opens.
   *
   * Applied over `TERM` and `COLORTERM`. A consumer names itself here through
   * `TERM_PROGRAM`; the export carries no product string of its own.
   */
  env?: Record<string, string>;
}

interface Session {
  pty: IPty;
  pending: Buffered;
  retained: Retained;
  timer: ReturnType<typeof setTimeout> | undefined;
  generation: number;
  summary: TerminalSession;
}

/**
 * A live session, for a consumer offering one back to a user.
 *
 * A view that unmounts without terminating leaves the session here. Enumerating
 * is what keeps that a detach rather than a leak: a consumer diffs this against
 * the views it holds to find the sessions nothing is showing.
 */
export interface TerminalSession {
  id: string;
  /** Where the shell started. Absolute, and already resolved. */
  cwd: string;
  shell: string;
  /** Milliseconds since the epoch. */
  startedAt: number;
}

/**
 * One manager per owner.
 *
 * An instance rather than module state, so a consumer with two windows gets
 * two registries and closing one cannot reap the other's shells.
 */
export class TerminalHost {
  private readonly sessions = new Map<string, Session>();
  private readonly generations = new Generations();
  private readonly options: Required<TerminalHostOptions>;

  constructor(options: TerminalHostOptions) {
    this.options = { flushMs: 8, env: {}, ...options };
  }

  /**
   * Open a shell, or attach to the one this id already names.
   *
   * Attaching resizes to the new view's dimensions and replays the retained
   * tail, so a view that arrives after a session started sees what it missed
   * rather than an empty screen.
   */
  spawn(request: SpawnOptions): void {
    const live = this.sessions.get(request.id);
    if (live) {
      this.attach(request, live);
      return;
    }

    const { homeDirectory, defaultShell, emit } = this.options;
    const resolved = resolveCwd(request.cwd, homeDirectory, (target) => {
      try {
        return { isDirectory: statSync(target).isDirectory() };
      } catch {
        return undefined;
      }
    });

    const generation = this.generations.next(request.id);

    // A refused directory is reported into the terminal rather than thrown.
    // The caller asked for a shell; it gets one, somewhere it can see named.
    if (!resolved.ok) {
      const reason = cwdMessage(resolved.reason, request.cwd ?? '');
      queueMicrotask(() => {
        emit(request.id, `\r\n\x1b[31m${reason}. Starting in ${homeDirectory}.\x1b[0m\r\n`);
      });
    }

    const cwd = resolved.ok ? resolved.cwd : homeDirectory;
    const shell = request.shell ?? defaultShell;

    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(1, request.cols),
      rows: Math.max(1, request.rows),
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...this.options.env,
      },
    });

    const session: Session = {
      pty,
      pending: emptyBuffer(),
      retained: emptyRetained(),
      timer: undefined,
      generation,
      summary: { id: request.id, cwd, shell, startedAt: Date.now() },
    };
    this.sessions.set(request.id, session);

    pty.onData((data) => {
      append(session.pending, data);
      retain(session.retained, data);
      this.schedule(request.id, session);
    });

    pty.onExit(({ exitCode }) => {
      this.flush(request.id, session);
      // A killed session's exit can arrive after the id was reused. Acting on
      // it then would delete the live session and silence a running shell.
      if (!this.generations.release(request.id, generation)) return;
      this.sessions.delete(request.id);
      this.options.onExit(request.id, exitCode);
    });
  }

  /** Every session this owner holds, whether or not a view is showing one. */
  list(): TerminalSession[] {
    return [...this.sessions.values()].map((session) => ({ ...session.summary }));
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    // node-pty throws on a zero or negative dimension, which happens whenever
    // a view is measured while hidden.
    this.sessions.get(id)?.pty.resize(Math.max(1, cols), Math.max(1, rows));
  }

  terminate(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    this.generations.release(id, session.generation);
    this.sessions.delete(id);
    try {
      session.pty.kill();
    } catch {
      // Already gone.
    }
  }

  /**
   * Every session this owner holds, detached ones included. Call when the
   * window closes, and on quit.
   */
  terminateAll(): void {
    for (const id of [...this.sessions.keys()]) this.terminate(id);
  }

  private attach(request: SpawnOptions, session: Session): void {
    session.pty.resize(Math.max(1, request.cols), Math.max(1, request.rows));
    const text = replay(session.retained);
    if (text === '') return;
    queueMicrotask(() => {
      this.options.emit(request.id, text);
    });
  }

  private flush(id: string, session: Session): void {
    session.timer = undefined;
    const { text, dropped } = drain(session.pending);
    if (text === '' && dropped === 0) return;
    const notice =
      dropped > 0
        ? `\r\n\x1b[2m[${String(dropped)} characters dropped: output outran the display]\x1b[0m\r\n`
        : '';
    this.options.emit(id, notice + text);
  }

  private schedule(id: string, session: Session): void {
    if (session.timer) return;
    session.timer = setTimeout(() => {
      this.flush(id, session);
    }, this.options.flushMs);
  }
}

/* ------------------------------------------------------------- the wiring */

/**
 * What a caller calls each terminal request channel.
 *
 * No defaults, for the reason `docs/embedding.md` gives for `exposeBridge`'s
 * namespace: a name this package picked is a name every consumer with a
 * contract of their own has to work around. Issue #22. The parameter lets a
 * caller pin the five to that contract.
 */
export interface TerminalRequestChannels<C extends string = string> {
  spawn: C;
  write: C;
  resize: C;
  terminate: C;
  list: C;
}

/**
 * The part of a manager these channels drive. `TerminalHost` satisfies it.
 *
 * A caller that keys a manager per window passes a function of the invoke
 * event instead: `src/main/native/pty.ts` holds one per `BrowserWindow`.
 */
export interface TerminalChannelHost {
  spawn(request: SpawnOptions): void;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  terminate(id: string): void;
  list(): TerminalSession[];
}

/**
 * The part of Electron's `ipcMain` this registration uses. Structural rather
 * than imported, so this module still loads no `electron`. `E` is the invoke
 * event, inferred from the caller's own `ipcMain`.
 */
export interface TerminalIpcMain<E> {
  handle(channel: string, listener: (event: E, request: unknown) => unknown): void;
}

/**
 * Answer a caller's terminal channels from a `TerminalHost`.
 *
 * The requests carry `SpawnOptions`, `{ id, data }`, `{ id, cols, rows }`,
 * `{ id }` and nothing, which is what `createTerminalTransport` sends. A
 * request that resolves to no manager is dropped, and `list` answers with no
 * sessions: nothing would reap a session opened for an owner that has gone.
 */
export function registerTerminalChannels<E, C extends string>(
  ipcMain: TerminalIpcMain<E>,
  host: TerminalChannelHost | ((event: E) => TerminalChannelHost | undefined),
  { channels }: { channels: TerminalRequestChannels<C> },
): void {
  const resolve = (event: E): TerminalChannelHost | undefined =>
    typeof host === 'function' ? host(event) : host;

  ipcMain.handle(channels.spawn, (event, request) => {
    resolve(event)?.spawn(request as SpawnOptions);
  });

  ipcMain.handle(channels.write, (event, request) => {
    const { id, data } = request as { id: string; data: string };
    resolve(event)?.write(id, data);
  });

  ipcMain.handle(channels.resize, (event, request) => {
    const { id, cols, rows } = request as { id: string; cols: number; rows: number };
    resolve(event)?.resize(id, cols, rows);
  });

  ipcMain.handle(channels.terminate, (event, request) => {
    resolve(event)?.terminate((request as { id: string }).id);
  });

  ipcMain.handle(channels.list, (event) => resolve(event)?.list() ?? []);
}
