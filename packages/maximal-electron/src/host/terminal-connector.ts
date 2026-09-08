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

/** Runs the requested command in a local pseudo-terminal. */
export class LocalPtyConnector implements TerminalConnector {
  connect(options: TerminalConnectOptions): IPty {
    const { command, args, ...ptyOptions } = options;
    return spawn(command, args, ptyOptions);
  }
}