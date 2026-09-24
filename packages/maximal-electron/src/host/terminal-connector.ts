import { spawn, type IPty } from 'node-pty';

/** The process operations and events a terminal host manages. */
export interface TerminalProcess {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  pause?(): void;
  resume?(): void;
  kill(): void;
}

/** Everything a connector needs to open one terminal process. */
export interface TerminalConnectOptions {
  command: string;
  args: string[];
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

/** Opens terminal processes without owning their session lifecycle. */
export interface TerminalConnector {
  connect(options: TerminalConnectOptions): TerminalProcess;
}

export interface TerminalDiagnostic {
  component: 'pty-host' | 'tmux-host';
  event: string;
  ownerId: string;
  sessionId: string;
  sessionCount: number;
  projectionCount?: number;
  commandQueueCount?: number;
  projectionId?: string;
  transport?: 'local' | 'ssh';
  ownership?: 'created' | 'existing';
  mirrorCount?: number;
  pendingCodeUnits?: number;
  inFlightCodeUnits?: number;
  exitCode?: number;
  accepted?: boolean;
}

export interface TerminalDiagnosticRecord extends TerminalDiagnostic {
  timestamp: number;
  processId: number;
  rss: number;
  heapUsed: number;
}

let diagnosticsConfigured = false;
let diagnosticSink: ((record: TerminalDiagnosticRecord) => void) | undefined;

export function configureTerminalDiagnostics(
  enabled: boolean | undefined,
  sink?: (record: TerminalDiagnosticRecord) => void,
): void {
  diagnosticsConfigured = enabled ?? false;
  diagnosticSink = diagnosticsConfigured ? sink : undefined;
}

export function terminalDiagnostic(snapshot: () => TerminalDiagnostic): void {
  if (!diagnosticsConfigured) return;
  try {
    const { rss, heapUsed } = process.memoryUsage();
    const record = {
      ...snapshot(),
      timestamp: Date.now(),
      processId: process.pid,
      rss,
      heapUsed,
    };
    if (diagnosticSink) diagnosticSink(record);
    else console.warn('[terminal-diagnostic]', JSON.stringify(record));
  } catch {
    return;
  }
}

/** Runs the requested command in a local pseudo-terminal. */
export class LocalPtyConnector implements TerminalConnector {
  connect(options: TerminalConnectOptions): IPty {
    const { command, args, ...ptyOptions } = options;
    return spawn(command, args, ptyOptions);
  }
}