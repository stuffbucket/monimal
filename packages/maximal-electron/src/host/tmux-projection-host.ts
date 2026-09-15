import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  LocalPtyConnector,
  type TerminalConnector,
} from './terminal-connector.js';
import {
  TmuxProjectionBroker,
  type TmuxProjectionRequest,
} from './tmux-projection-broker.js';
import type { TerminalGeometryEvents } from './terminal-session-backend.js';

export interface TmuxProjectionLaunch {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  ownership: 'created' | 'existing';
  geometry:
    | { transport: 'local'; sessionName: string }
    | { transport: 'ssh'; alias: string; sessionName: string };
  terminate?: { command: string; args: string[] };
}

export type TmuxProjectionMetadata = Pick<
  TmuxProjectionLaunch,
  'ownership' | 'geometry' | 'terminate'
>;

export type TmuxProjectionCommand = (
  command: string,
  args: readonly string[],
) => Promise<{ stdout: string }>;

export interface TmuxProjectionHostOptions extends TerminalGeometryEvents {
  homeDirectory: string;
  env?: Record<string, string>;
  connector?: TerminalConnector;
  command?: TmuxProjectionCommand;
  terminate(command: string, args: string[]): void;
  emit(sessionId: string, projectionId: string, chunk: string): void;
  onExit(sessionId: string, projectionId: string, exitCode: number): void;
}

const execFileAsync = promisify(execFile);
const SAFE_TMUX_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_SSH_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$/;
const TMUX_WINDOW_SIZES = new Set(['largest', 'smallest', 'manual', 'latest']);
const TMUX_GEOMETRY = /^([1-9]\d*)x([1-9]\d*)$/;

async function defaultCommand(command: string, args: readonly string[]): Promise<{ stdout: string }> {
  const result = await execFileAsync(command, [...args], {
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 64 * 1024,
    shell: false,
  });
  return { stdout: result.stdout };
}

function geometryCommand(
  geometry: NonNullable<TmuxProjectionLaunch['geometry']>,
  tmuxArgs: readonly string[],
): { command: string; args: string[] } {
  if (!SAFE_TMUX_NAME.test(geometry.sessionName)) throw new Error('Invalid trusted tmux session name.');
  if (geometry.transport === 'local') return { command: 'tmux', args: [...tmuxArgs] };
  if (!SAFE_SSH_ALIAS.test(geometry.alias)) throw new Error('Invalid trusted SSH alias.');
  const remoteCommand = ['tmux', ...tmuxArgs]
    .map((arg) => arg === ';' ? '\\;' : arg)
    .map((arg) => arg === '#{window_width}x#{window_height}' ? `'${arg}'` : arg)
    .join(' ');
  return { command: 'ssh', args: [geometry.alias, remoteCommand] };
}

function parseGeometry(stdout: string): { cols: number; rows: number } {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    const match = TMUX_GEOMETRY.exec(line.trim());
    if (match) return { cols: Number(match[1]), rows: Number(match[2]) };
  }
  throw new Error('Tmux did not report its actual window geometry.');
}

/** Binds trusted tmux commands to projection lifecycle policy. */
export class TmuxProjectionHost {
  private readonly launches = new Map<string, TmuxProjectionLaunch>();
  private readonly originalWindowSizes = new Map<string, string>();
  private readonly commandQueues = new Map<string, Promise<void>>();
  private readonly broker: TmuxProjectionBroker;
  private readonly connector: TerminalConnector;
  private readonly command: TmuxProjectionCommand;

  constructor(private readonly options: TmuxProjectionHostOptions) {
    this.connector = options.connector ?? new LocalPtyConnector();
    this.command = options.command ?? defaultCommand;
    this.broker = new TmuxProjectionBroker({
      attach: (request) => this.connect(request),
      applyGeometry: (sessionId, cols, rows) => this.applyGeometry(sessionId, cols, rows),
      releaseGeometry: (sessionId) => this.restoreGeometry(sessionId),
      terminateSession: (sessionId) => {
        const launch = this.launches.get(sessionId)!;
        if (launch.ownership === 'existing') void this.restoreGeometry(sessionId);
        else this.originalWindowSizes.delete(sessionId);
        this.launches.delete(sessionId);
        if (launch.terminate) {
          this.options.terminate(launch.terminate.command, launch.terminate.args);
        }
      },
      emit: (sessionId, projectionId, chunk) => options.emit(sessionId, projectionId, chunk),
      onExit: (sessionId, projectionId, exitCode) => options.onExit(sessionId, projectionId, exitCode),
      onGeometry: (sessionId, cols, rows) => options.onGeometry?.(sessionId, cols, rows),
      onGeometryError: (sessionId, error) => options.onGeometryError?.(sessionId, error),
    });
  }

  reserve(sessionId: string, launch: TmuxProjectionLaunch): void {
    if (this.launches.has(sessionId)) throw new Error('Tmux projection session already exists.');
    this.launches.set(sessionId, launch);
  }

  has(sessionId: string): boolean {
    return this.launches.has(sessionId);
  }

  attach(request: TmuxProjectionRequest): boolean {
    return this.launches.has(request.sessionId) && this.broker.attach(request);
  }

  focus(sessionId: string, projectionId: string, cols: number, rows: number): number | undefined {
    return this.broker.focus(sessionId, projectionId, cols, rows);
  }

  write(sessionId: string, projectionId: string, epoch: number, data: string): boolean {
    return this.broker.write(sessionId, projectionId, epoch, data);
  }

  resize(sessionId: string, projectionId: string, epoch: number, cols: number, rows: number): boolean {
    return this.broker.resize(sessionId, projectionId, epoch, cols, rows);
  }

  settleGeometry(sessionId: string): Promise<{ cols: number; rows: number } | undefined> {
    return this.broker.settleGeometry(sessionId);
  }

  detach(sessionId: string, projectionId: string): boolean {
    return this.broker.detach(sessionId, projectionId);
  }

  terminate(sessionId: string): boolean {
    const launch = this.launches.get(sessionId);
    if (!launch) return false;
    if (this.broker.terminate(sessionId)) return true;
    if (launch.ownership === 'existing') void this.restoreGeometry(sessionId);
    else this.originalWindowSizes.delete(sessionId);
    this.launches.delete(sessionId);
    if (launch.terminate) {
      this.options.terminate(launch.terminate.command, launch.terminate.args);
    }
    return true;
  }

  terminateAll(): void {
    for (const sessionId of [...this.launches.keys()]) this.terminate(sessionId);
  }

  abandonAll(): void {
    for (const sessionId of [...this.launches.keys()]) {
      this.broker.abandon(sessionId);
      void this.restoreGeometry(sessionId);
      this.launches.delete(sessionId);
    }
  }

  private connect(request: TmuxProjectionRequest) {
    const launch = this.launches.get(request.sessionId)!;
    return this.connector.connect({
      command: launch.command,
      args: launch.args,
      name: 'xterm-256color',
      cols: request.cols,
      rows: request.rows,
      cwd: launch.cwd ?? this.options.homeDirectory,
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...this.options.env,
        ...launch.env,
      },
    });
  }

  private async applyGeometry(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<{ cols: number; rows: number }> {
    const launch = this.launches.get(sessionId);
    if (!launch) throw new Error('Tmux projection session is not reserved.');
    return this.enqueueCommand(sessionId, async () => {
      if (!this.originalWindowSizes.has(sessionId)) {
        const show = geometryCommand(launch.geometry, [
          'show-options', '-wv', '-t', launch.geometry.sessionName, 'window-size',
        ]);
        const original = (await this.command(show.command, show.args)).stdout.trim();
        if (!TMUX_WINDOW_SIZES.has(original)) {
          throw new Error('Tmux reported an invalid window-size policy.');
        }
        this.originalWindowSizes.set(sessionId, original);
      }
      const resize = geometryCommand(launch.geometry, [
        'set-option', '-w', '-t', launch.geometry.sessionName, 'window-size', 'manual',
        ';',
        'resize-window', '-t', launch.geometry.sessionName, '-x', String(cols), '-y', String(rows),
        ';',
        'display-message', '-p', '-t', launch.geometry.sessionName,
        '#{window_width}x#{window_height}',
      ]);
      return parseGeometry((await this.command(resize.command, resize.args)).stdout);
    });
  }

  private async restoreGeometry(sessionId: string): Promise<void> {
    const launch = this.launches.get(sessionId);
    if (!launch) return;
    await this.enqueueCommand(sessionId, async () => {
      const original = this.originalWindowSizes.get(sessionId);
      if (!original) return;
      this.originalWindowSizes.delete(sessionId);
      const restore = geometryCommand(launch.geometry, [
        'set-option', '-w', '-t', launch.geometry.sessionName, 'window-size', original,
      ]);
      await this.command(restore.command, restore.args);
    });
  }

  private enqueueCommand<Result>(
    sessionId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const result = (this.commandQueues.get(sessionId) ?? Promise.resolve())
      .then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.commandQueues.set(sessionId, tail);
    void tail.then(() => {
      if (this.commandQueues.get(sessionId) === tail) this.commandQueues.delete(sessionId);
    });
    return result;
  }
}