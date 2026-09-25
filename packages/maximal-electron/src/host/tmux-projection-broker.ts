import type { TerminalProcess } from './terminal-connector.js';
import type {
  TerminalGeometryEvents,
  TerminalSessionBackend,
  TerminalSessionProjectionRequest,
} from './terminal-session-backend.js';

export type TmuxProjectionProcess = TerminalProcess;

export type TmuxProjectionRequest = TerminalSessionProjectionRequest;

export interface TmuxProjectionBrokerOptions extends TerminalGeometryEvents {
  attach(request: TmuxProjectionRequest): TmuxProjectionProcess;
  applyGeometry?(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<{ cols: number; rows: number }>;
  releaseGeometry?(sessionId: string): Promise<void>;
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
  desiredCols: number;
  desiredRows: number;
  actualGeometry: { cols: number; rows: number } | undefined;
  geometryRevision: number;
  geometryQueue: Promise<void>;
}

function dimension(value: number): number {
  return Math.max(1, value);
}

/** Coordinates ordinary tmux client PTYs around one server-owned pane. */
export class TmuxProjectionBroker implements TerminalSessionBackend {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: TmuxProjectionBrokerOptions) {}

  attach(request: TmuxProjectionRequest): boolean {
    const existing = this.sessions.get(request.sessionId);
    const session = existing ?? {
      projections: new Map(),
      focusOwner: undefined,
      focusEpoch: 0,
      desiredCols: dimension(request.cols),
      desiredRows: dimension(request.rows),
      actualGeometry: undefined,
      geometryRevision: 0,
      geometryQueue: Promise.resolve(),
    };
    if (session.projections.has(request.projectionId)) return false;
    this.sessions.set(request.sessionId, session);

    const process = this.options.attach({
      ...request,
      cols: session.actualGeometry?.cols ?? session.desiredCols,
      rows: session.actualGeometry?.rows ?? session.desiredRows,
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
      if (session.projections.size === 0) this.releaseGeometry(request.sessionId, session);
      this.options.onExit(request.sessionId, request.projectionId, exitCode);
    });
    return true;
  }

  focus(sessionId: string, projectionId: string, cols: number, rows: number): number | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.projections.has(projectionId)) return undefined;
    session.focusOwner = projectionId;
    session.focusEpoch += 1;
    this.requestGeometry(sessionId, session, cols, rows);
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
    this.requestGeometry(sessionId, session, cols, rows);
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
    if (session.projections.size === 0) this.releaseGeometry(sessionId, session);
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
    return this.sessions.get(sessionId)?.actualGeometry;
  }

  projectionCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.projections.size ?? 0;
  }

  async settleGeometry(sessionId: string): Promise<{ cols: number; rows: number } | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    await session.geometryQueue;
    return this.sessions.get(sessionId) === session ? session.actualGeometry : undefined;
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

  private requestGeometry(sessionId: string, session: Session, cols: number, rows: number): void {
    session.desiredCols = dimension(cols);
    session.desiredRows = dimension(rows);
    const requestedCols = session.desiredCols;
    const requestedRows = session.desiredRows;
    if (!this.options.applyGeometry) {
      session.actualGeometry = { cols: requestedCols, rows: requestedRows };
    }
    const revision = ++session.geometryRevision;
    for (const projection of session.projections.values()) {
      projection.process.resize(requestedCols, requestedRows);
    }
    session.geometryQueue = session.geometryQueue
      .then(async () => {
        const actual = this.options.applyGeometry
          ? await this.options.applyGeometry(sessionId, requestedCols, requestedRows)
          : { cols: requestedCols, rows: requestedRows };
        if (
          this.sessions.get(sessionId) !== session
          || revision !== session.geometryRevision
          || session.projections.size === 0
        ) return;
        session.actualGeometry = {
          cols: dimension(actual.cols),
          rows: dimension(actual.rows),
        };
        if (
          session.actualGeometry.cols !== requestedCols
          || session.actualGeometry.rows !== requestedRows
        ) {
          for (const projection of session.projections.values()) {
            projection.process.resize(session.actualGeometry.cols, session.actualGeometry.rows);
          }
        }
        this.options.onGeometry?.(
          sessionId,
          session.actualGeometry.cols,
          session.actualGeometry.rows,
        );
      })
      .catch((error: unknown) => {
        if (this.sessions.get(sessionId) === session && revision === session.geometryRevision) {
          this.options.onGeometryError?.(sessionId, error);
        }
      });
  }

  private releaseGeometry(sessionId: string, session: Session): void {
    session.actualGeometry = undefined;
    ++session.geometryRevision;
    session.geometryQueue = session.geometryQueue
      .then(() => this.options.releaseGeometry?.(sessionId))
      .catch((error: unknown) => {
        if (this.sessions.get(sessionId) === session) {
          this.options.onGeometryError?.(sessionId, error);
        }
      });
  }
}