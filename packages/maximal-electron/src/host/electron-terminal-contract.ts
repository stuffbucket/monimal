/** Open a shell for one opaque terminal session. */
export interface PtySpawnRequest {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyWriteRequest {
  id: string;
  data: string;
}

export interface PtyResizeRequest {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyProjectionRequest {
  id: string;
  projectionId: string;
}

export interface PtyProjectionAttachRequest extends PtyProjectionRequest {
  cols: number;
  rows: number;
}

export interface PtyProjectionControlRequest extends PtyProjectionRequest {
  epoch: number;
}

export interface PtyProjectionWriteRequest extends PtyProjectionControlRequest {
  data: string;
}

export interface PtyProjectionResizeRequest extends PtyProjectionControlRequest {
  cols: number;
  rows: number;
}

/** A renderer-visible terminal profile, with no executable configuration. */
export interface TerminalProfileSummary {
  id: string;
  label: string;
  kind: 'local' | 'tmux-control' | 'docker' | 'podman' | 'lima' | 'multipass' | 'kubernetes' | 'wsl' | 'vagrant' | 'ssh' | 'tmux' | 'ssh-tmux';
}

export interface TerminalTargetSummary {
  id: string;
  profileId: string;
  label: string;
  state: 'available' | 'unavailable' | 'timed-out';
}

export interface TerminalDiscovery {
  generation: number;
  targets: TerminalTargetSummary[];
}

export interface TerminalLaunchRequest {
  profileId: string;
  targetId?: string;
  cols: number;
  rows: number;
}

export interface TerminalLaunchResult {
  sessionId: string;
  label: string;
}

/** A live shell, whether or not a terminal view is showing it. */
export interface PtySession {
  id: string;
  cwd: string;
  shell: string;
  /** Milliseconds since the epoch. */
  startedAt: number;
}

/** A terminal session was registered or its current process exited. */
export type PtyStatus =
  | { state: 'started'; session: PtySession }
  | { state: 'exited'; id: string; exitCode: number };
