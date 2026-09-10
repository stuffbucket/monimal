import { statSync } from 'node:fs';

import {
  append,
  cwdMessage,
  drain,
  emptyBuffer,
  emptyRetained,
  Generations,
  MAX_IN_FLIGHT_BYTES,
  PAUSE_HIGH_WATERMARK,
  replay,
  resolveCwd,
  RESUME_LOW_WATERMARK,
  retain,
  type Buffered,
  type Retained,
} from '../main/native/pty-session.js';
import {
  LocalPtyConnector,
  type TerminalConnector,
  type TerminalProcess,
} from './terminal-connector.js';

export {
  LocalPtyConnector,
  type TerminalConnectOptions,
  type TerminalConnector,
  type TerminalProcess,
} from './terminal-connector.js';
export {
  TmuxProjectionBroker,
  type TmuxProjectionBrokerOptions,
  type TmuxProjectionProcess,
  type TmuxProjectionRequest,
} from './tmux-projection-broker.js';
export {
  TmuxProjectionHost,
  type TmuxProjectionHostOptions,
  type TmuxProjectionLaunch,
} from './tmux-projection-host.js';
export {
  TmuxProjectionOwners,
  type TmuxProjectionOwnersOptions,
} from './tmux-projection-owners.js';

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
  emit: (id: string, chunk: string, sequence?: number) => void;
  onExit: (id: string, exitCode: number) => void;
  /** Reports a session after registration and when its current process exits. */
  onStatus?: (status: TerminalStatus) => void;
}

export interface SpawnOptions {
  id: string;
  cols: number;
  rows: number;
  shell?: string;
  cwd?: string;
  /** Optional command arguments, for a trusted host-owned launcher. */
  args?: string[];
  /** Optional command environment, for a trusted host-owned launcher. */
  env?: Record<string, string>;
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
  /** Opens the process behind each session. Defaults to a local pseudo-terminal. */
  connector?: TerminalConnector;
  /** Bound output until `acknowledge` confirms the renderer consumed it. */
  flowControl?: boolean;
}

interface Session {
  process: TerminalProcess;
  pending: Buffered;
  retained: Retained;
  timer: ReturnType<typeof setTimeout> | undefined;
  generation: number;
  summary: TerminalSession;
  nextSequence: number;
  acknowledgedSequence: number;
  inFlight: Map<number, number>;
  inFlightBytes: number;
  paused: boolean;
  exitCode: number | undefined;
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

/** A session lifecycle change for hosts that choose to observe it. */
export type TerminalStatus =
  | { state: 'started'; session: TerminalSession }
  | { state: 'exited'; id: string; exitCode: number };

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
    this.options = {
      flushMs: 8,
      env: {},
      connector: new LocalPtyConnector(),
      flowControl: false,
      onStatus: () => undefined,
      ...options,
    };
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

    const terminalProcess = this.options.connector.connect({
      command: shell,
      args: request.args ?? [],
      name: 'xterm-256color',
      cols: Math.max(1, request.cols),
      rows: Math.max(1, request.rows),
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...this.options.env,
        ...request.env,
      },
    });

    const session: Session = {
      process: terminalProcess,
      pending: emptyBuffer(),
      retained: emptyRetained(),
      timer: undefined,
      generation,
      summary: { id: request.id, cwd, shell, startedAt: Date.now() },
      nextSequence: 1,
      acknowledgedSequence: 0,
      inFlight: new Map(),
      inFlightBytes: 0,
      paused: false,
      exitCode: undefined,
    };
    this.sessions.set(request.id, session);
    this.options.onStatus?.({ state: 'started', session: { ...session.summary } });

    terminalProcess.onData((data) => {
      append(session.pending, data);
      retain(session.retained, data);
      this.schedule(request.id, session);
    });

    terminalProcess.onExit(({ exitCode }) => {
      this.flush(request.id, session);
      // A killed session's exit can arrive after the id was reused. Acting on
      // it then would delete the live session and silence a running shell.
      if (!this.generations.isCurrent(request.id, generation)) return;
      session.exitCode = exitCode;
      this.finishExit(request.id, session);
    });
  }

  /** Every session this owner holds, whether or not a view is showing one. */
  list(): TerminalSession[] {
    return [...this.sessions.values()].map((session) => ({ ...session.summary }));
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.process.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    // node-pty throws on a zero or negative dimension, which happens whenever
    // a view is measured while hidden.
    this.sessions.get(id)?.process.resize(Math.max(1, cols), Math.max(1, rows));
  }

  terminate(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    this.generations.release(id, session.generation);
    this.sessions.delete(id);
    try {
      session.process.kill();
    } catch {
      // Already gone.
    }
  }

  /** Confirm all output through this cumulative sequence was consumed. */
  acknowledge(id: string, sequence: number): void {
    if (!this.options.flowControl || !Number.isSafeInteger(sequence)) return;
    const session = this.sessions.get(id);
    if (!session || sequence <= session.acknowledgedSequence || sequence >= session.nextSequence) {
      return;
    }

    session.acknowledgedSequence = sequence;
    for (const [sent, bytes] of session.inFlight) {
      if (sent > sequence) continue;
      session.inFlight.delete(sent);
      session.inFlightBytes -= bytes;
    }
    this.updatePause(session);
    this.flush(id, session);
    this.finishExit(id, session);
  }

  /**
   * Every session this owner holds, detached ones included. Call when the
   * window closes, and on quit.
   */
  terminateAll(): void {
    for (const id of [...this.sessions.keys()]) this.terminate(id);
  }

  private attach(request: SpawnOptions, session: Session): void {
    session.process.resize(Math.max(1, request.cols), Math.max(1, request.rows));
    const text = replay(session.retained);
    if (text === '') return;
    if (!this.options.flowControl) {
      queueMicrotask(() => {
        this.options.emit(request.id, text);
      });
      return;
    }
    append(session.pending, text);
    this.schedule(request.id, session);
  }

  private flush(id: string, session: Session): void {
    session.timer = undefined;
    if (this.options.flowControl && session.inFlightBytes >= MAX_IN_FLIGHT_BYTES) return;
    const { text, dropped } = drain(session.pending);
    if (text === '' && dropped === 0) return;
    let output = text;
    if (dropped > 0) {
      const notice = `\r\n\x1b[2m[${String(dropped)} characters dropped: output outran the display]\x1b[0m\r\n`;
      output = notice + text.slice(Math.max(0, text.length - (MAX_IN_FLIGHT_BYTES - notice.length)));
    }
    if (!this.options.flowControl) {
      this.options.emit(id, output);
      return;
    }
    const sequence = session.nextSequence++;
    session.inFlight.set(sequence, output.length);
    session.inFlightBytes += output.length;
    this.options.emit(id, output, sequence);
    this.updatePause(session);
  }

  private schedule(id: string, session: Session): void {
    if (session.timer) return;
    session.timer = setTimeout(() => {
      this.flush(id, session);
    }, this.options.flushMs);
  }

  private updatePause(session: Session): void {
    if (!this.options.flowControl) return;
    if (!session.paused && session.inFlightBytes >= PAUSE_HIGH_WATERMARK) {
      session.process.pause?.();
      session.paused = true;
    } else if (session.paused && session.inFlightBytes <= RESUME_LOW_WATERMARK) {
      session.process.resume?.();
      session.paused = false;
    }
  }

  private finishExit(id: string, session: Session): void {
    if (session.exitCode === undefined) return;
    if (this.options.flowControl && (session.pending.text !== '' || session.inFlightBytes > 0)) {
      return;
    }
    if (!this.generations.release(id, session.generation)) return;
    this.sessions.delete(id);
    this.options.onExit(id, session.exitCode);
    this.options.onStatus?.({ state: 'exited', id, exitCode: session.exitCode });
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
  /** Optional: enables bounded cumulative output acknowledgements. */
  ack?: C;
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
  acknowledge?(id: string, sequence: number): void;
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

  if (channels.ack) {
    ipcMain.handle(channels.ack, (event, request) => {
      const { id, sequence } = request as { id: string; sequence: number };
      resolve(event)?.acknowledge?.(id, sequence);
    });
  }
}
