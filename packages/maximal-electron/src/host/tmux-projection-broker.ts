import type { TerminalProcess } from './terminal-connector.js';

export type TmuxProjectionProcess = TerminalProcess;

export interface TmuxProjectionRequest {
  sessionId: string;
  projectionId: string;
  cols: number;
  rows: number;
}

export interface TmuxProjectionBrokerOptions {
  attach(request: TmuxProjectionRequest): TmuxProjectionProcess;
  terminateSession(sessionId: string): void;
  emit(sessionId: string, projectionId: string, chunk: string): void;
  onExit(sessionId: string, projectionId: string, exitCode: number): void;
}

interface Projection {
  process: TmuxProjectionProcess;
}

interface Session {
  projections: Map<string, Projection>;
  focusOwner: string | undefined;
  focusEpoch: number;
  cols: number;
  rows: number;
}

function dimension(value: number): number {
  return Math.max(1, value);
}

/** Coordinates ordinary tmux client PTYs around one server-owned pane. */
export class TmuxProjectionBroker {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: TmuxProjectionBrokerOptions) {}

  attach(request: TmuxProjectionRequest): boolean {
    const existing = this.sessions.get(request.sessionId);
    const session = existing ?? {
      projections: new Map(),
      focusOwner: undefined,
      focusEpoch: 0,
      cols: dimension(request.cols),
      rows: dimension(request.rows),
    };
    if (session.projections.has(request.projectionId)) return false;
    this.sessions.set(request.sessionId, session);

    const process = this.options.attach({
      ...request,
      cols: session.cols,
      rows: session.rows,
    });
    const projection = { process };
    session.projections.set(request.projectionId, projection);
    process.onData((chunk) => {
      if (session.projections.get(request.projectionId) === projection) {
        this.options.emit(request.sessionId, request.projectionId, chunk);
      }
    });
    process.onExit(({ exitCode }) => {
      if (session.projections.get(request.projectionId) !== projection) return;
      session.projections.delete(request.projectionId);
      if (session.focusOwner === request.projectionId) {
        session.focusOwner = undefined;
        session.focusEpoch += 1;
      }
      this.options.onExit(request.sessionId, request.projectionId, exitCode);
    });
    return true;
  }

  focus(sessionId: string, projectionId: string, cols: number, rows: number): number | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.projections.has(projectionId)) return undefined;
    session.focusOwner = projectionId;
    session.focusEpoch += 1;
    this.applyGeometry(session, cols, rows);
    return session.focusEpoch;
  }

  write(sessionId: string, projectionId: string, epoch: number, data: string): boolean {
    const session = this.controlledSession(sessionId, projectionId, epoch);
    const projection = session?.projections.get(projectionId);
    if (!projection) return false;
    projection.process.write(data);
    return true;
  }

  resize(sessionId: string, projectionId: string, epoch: number, cols: number, rows: number): boolean {
    const session = this.controlledSession(sessionId, projectionId, epoch);
    if (!session) return false;
    this.applyGeometry(session, cols, rows);
    return true;
  }

  detach(sessionId: string, projectionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const projection = session.projections.get(projectionId);
    if (!projection) return false;
    session.projections.delete(projectionId);
    if (session.focusOwner === projectionId) {
      session.focusOwner = undefined;
      session.focusEpoch += 1;
    }
    projection.process.kill();
    return true;
  }

  terminate(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    for (const projection of session.projections.values()) projection.process.kill();
    this.options.terminateSession(sessionId);
    return true;
  }

  abandon(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    for (const projection of session.projections.values()) projection.process.kill();
    return true;
  }

  geometry(sessionId: string): { cols: number; rows: number } | undefined {
    const session = this.sessions.get(sessionId);
    return session ? { cols: session.cols, rows: session.rows } : undefined;
  }

  private controlledSession(
    sessionId: string,
    projectionId: string,
    epoch: number,
  ): Session | undefined {
    const session = this.sessions.get(sessionId);
    return session?.focusOwner === projectionId && session.focusEpoch === epoch
      ? session
      : undefined;
  }

  private applyGeometry(session: Session, cols: number, rows: number): void {
    session.cols = dimension(cols);
    session.rows = dimension(rows);
    for (const projection of session.projections.values()) {
      projection.process.resize(session.cols, session.rows);
    }
  }
}