import { randomUUID } from 'node:crypto';

import {
  LocalPtyConnector,
  terminalDiagnostic,
  type TerminalConnector,
  type TerminalDiagnostic,
} from '../host/connector.js';
import {
  TmuxProjectionBroker,
  type TmuxProjectionRequest,
} from './projection-broker.js';
import type { TerminalGeometryEvents } from '../host/session-backend.js';
import {
  TmuxWindowGeometry,
  type TmuxGeometryTarget,
  type TmuxProjectionCommand,
} from './window-geometry.js';

export interface TmuxProjectionLaunch {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  ownership: 'created' | 'existing';
  geometry: TmuxGeometryTarget;
  terminate?: { command: string; args: string[] };
}

export type TmuxProjectionMetadata = Pick<
  TmuxProjectionLaunch,
  'ownership' | 'geometry' | 'terminate'
>;

export interface TmuxProjectionHostOptions extends TerminalGeometryEvents {
  homeDirectory: string;
  env?: Record<string, string>;
  connector?: TerminalConnector;
  command?: TmuxProjectionCommand;
  terminate(command: string, args: string[]): void;
  emit(sessionId: string, projectionId: string, chunk: string): void;
  onExit(sessionId: string, projectionId: string, exitCode: number): void;
}

/** Binds trusted tmux commands to projection lifecycle policy. */
export class TmuxProjectionHost {
  private readonly diagnosticOwnerId = randomUUID();
  private readonly launches = new Map<string, TmuxProjectionLaunch>();
  private readonly geometry: TmuxWindowGeometry;
  private readonly broker: TmuxProjectionBroker;
  private readonly connector: TerminalConnector;

  constructor(private readonly options: TmuxProjectionHostOptions) {
    this.connector = options.connector ?? new LocalPtyConnector();
    this.geometry = new TmuxWindowGeometry(
      (sessionId, succeeded) => { this.diagnose(succeeded ? 'command-completed' : 'command-failed', sessionId); },
      options.command,
    );
    this.broker = new TmuxProjectionBroker({
      attach: (request) => this.connect(request),
      applyGeometry: (sessionId, cols, rows) => this.applyGeometry(sessionId, cols, rows),
      releaseGeometry: (sessionId) => this.restoreGeometry(sessionId),
      terminateSession: (sessionId) => {
        const launch = this.launches.get(sessionId)!;
        if (launch.ownership === 'existing') void this.restoreGeometry(sessionId);
        else this.geometry.forget(sessionId);
        this.launches.delete(sessionId);
        if (launch.terminate) {
          this.options.terminate(launch.terminate.command, launch.terminate.args);
        }
      },
      emit: (sessionId, projectionId, chunk) => options.emit(sessionId, projectionId, chunk),
      onExit: (sessionId, projectionId, exitCode) => {
        this.diagnose('client-exited', sessionId, { projectionId, exitCode });
        options.onExit(sessionId, projectionId, exitCode);
      },
      onGeometry: (sessionId, cols, rows) => {
        this.diagnose('geometry-applied', sessionId);
        const onGeometry = options.onGeometry;
        if (onGeometry) onGeometry(sessionId, cols, rows);
      },
      onGeometryError: (sessionId, error) => {
        this.diagnose('geometry-failed', sessionId);
        const onGeometryError = options.onGeometryError;
        if (onGeometryError) onGeometryError(sessionId, error);
      },
    });
  }

  reserve(sessionId: string, launch: TmuxProjectionLaunch): void {
    if (this.launches.has(sessionId)) throw new Error('Tmux projection session already exists.');
    this.launches.set(sessionId, launch);
    this.diagnose('reserved', sessionId);
  }

  has(sessionId: string): boolean {
    return this.launches.has(sessionId);
  }

  attach(request: TmuxProjectionRequest): boolean {
    try {
      const accepted = this.launches.has(request.sessionId) && this.broker.attach(request);
      this.diagnose('attach', request.sessionId, { projectionId: request.projectionId, accepted });
      return accepted;
    } catch (error) {
      this.diagnose('attach-failed', request.sessionId, { projectionId: request.projectionId });
      throw error;
    }
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
    const accepted = this.broker.detach(sessionId, projectionId);
    this.diagnose('detach', sessionId, { projectionId, accepted });
    return accepted;
  }

  terminate(sessionId: string): boolean {
    const launch = this.launches.get(sessionId);
    if (!launch) return false;
    this.diagnose('termination-requested', sessionId);
    if (this.broker.terminate(sessionId)) {
      this.diagnose('released', sessionId);
      return true;
    }
    this.launches.delete(sessionId);
    if (launch.terminate) {
      this.options.terminate(launch.terminate.command, launch.terminate.args);
    }
    this.diagnose('released', sessionId);
    return true;
  }

  terminateAll(): void {
    for (const sessionId of [...this.launches.keys()]) this.terminate(sessionId);
  }

  abandonAll(): void {
    for (const sessionId of [...this.launches.keys()]) {
      this.diagnose('abandon-requested', sessionId);
      this.broker.abandon(sessionId);
      void this.restoreGeometry(sessionId);
      this.launches.delete(sessionId);
      this.diagnose('released', sessionId);
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

  private applyGeometry(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<{ cols: number; rows: number }> {
    const launch = this.launches.get(sessionId)!;
    return this.geometry.apply(sessionId, launch.geometry, cols, rows);
  }

  private async restoreGeometry(sessionId: string): Promise<void> {
    const launch = this.launches.get(sessionId)!;
    await this.geometry.restore(sessionId, launch.geometry);
  }

  private diagnose(
    event: string,
    sessionId: string,
    details: Pick<TerminalDiagnostic, 'projectionId' | 'exitCode' | 'accepted'> = {},
  ): void {
    terminalDiagnostic(() => ({
      component: 'tmux-host', event, sessionId, ...details,
      ownerId: this.diagnosticOwnerId,
      sessionCount: this.launches.size,
      projectionCount: this.broker.projectionCount(sessionId),
      commandQueueCount: this.geometry.queueCount,
      transport: this.launches.get(sessionId)?.geometry.transport,
      ownership: this.launches.get(sessionId)?.ownership,
    }));
  }
}