/**
 * Common lifecycle contract for a session with one or more terminal views.
 *
 * Direct local shells may expose one projection, while tmux-backed sessions
 * expose many. The backend owns the canonical session state; a view owns only
 * its projection id and focus epoch.
 */
export interface TerminalSessionBackend {
  attach(request: TerminalSessionProjectionRequest): boolean;
  focus(
    sessionId: string,
    projectionId: string,
    cols: number,
    rows: number,
  ): number | undefined;
  write(sessionId: string, projectionId: string, epoch: number, data: string): boolean;
  resize(
    sessionId: string,
    projectionId: string,
    epoch: number,
    cols: number,
    rows: number,
  ): boolean;
  detach(sessionId: string, projectionId: string): boolean;
  terminate(sessionId: string): boolean;
  /** Drop client projections while leaving a persistent backend session alive. */
  abandon(sessionId: string): boolean;
  geometry(sessionId: string): { cols: number; rows: number } | undefined;
}

export interface TerminalSessionProjectionRequest {
  sessionId: string;
  projectionId: string;
  cols: number;
  rows: number;
}

export interface TerminalGeometryEvents {
  onGeometry?(sessionId: string, cols: number, rows: number): void;
  onGeometryError?(sessionId: string, error: unknown): void;
}
