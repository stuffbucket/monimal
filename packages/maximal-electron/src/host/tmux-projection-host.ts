import {
  LocalPtyConnector,
  type TerminalConnector,
} from './terminal-connector.js';
import {
  TmuxProjectionBroker,
  type TmuxProjectionRequest,
} from './tmux-projection-broker.js';

export interface TmuxProjectionLaunch {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  terminate: { command: string; args: string[] };
}

export interface TmuxProjectionHostOptions {
  homeDirectory: string;
  env?: Record<string, string>;
  connector?: TerminalConnector;
  terminate(command: string, args: string[]): void;
  emit(sessionId: string, projectionId: string, chunk: string): void;
  onExit(sessionId: string, projectionId: string, exitCode: number): void;
}

/** Binds trusted tmux commands to projection lifecycle policy. */
export class TmuxProjectionHost {
  private readonly launches = new Map<string, TmuxProjectionLaunch>();
  private readonly broker: TmuxProjectionBroker;
  private readonly connector: TerminalConnector;

  constructor(private readonly options: TmuxProjectionHostOptions) {
    this.connector = options.connector ?? new LocalPtyConnector();
    this.broker = new TmuxProjectionBroker({
      attach: (request) => this.connect(request),
      terminateSession: (sessionId) => {
        const launch = this.launches.get(sessionId)!;
        this.launches.delete(sessionId);
        this.options.terminate(launch.terminate.command, launch.terminate.args);
      },
      emit: (sessionId, projectionId, chunk) => options.emit(sessionId, projectionId, chunk),
      onExit: (sessionId, projectionId, exitCode) => options.onExit(sessionId, projectionId, exitCode),
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

  detach(sessionId: string, projectionId: string): boolean {
    return this.broker.detach(sessionId, projectionId);
  }

  terminate(sessionId: string): boolean {
    const launch = this.launches.get(sessionId);
    if (!launch) return false;
    if (this.broker.terminate(sessionId)) return true;
    this.launches.delete(sessionId);
    this.options.terminate(launch.terminate.command, launch.terminate.args);
    return true;
  }

  terminateAll(): void {
    for (const sessionId of [...this.launches.keys()]) this.terminate(sessionId);
  }

  abandonAll(): void {
    for (const sessionId of [...this.launches.keys()]) {
      this.broker.abandon(sessionId);
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
}