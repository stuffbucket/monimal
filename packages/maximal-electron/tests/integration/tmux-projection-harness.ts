import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

import {
  LocalPtyConnector,
  TmuxProjectionBroker,
} from '../../src/host/terminal-host.js';

const WAIT_MS = 5_000;

export class TmuxProjectionHarness {
  readonly sessionId = 'shared';
  private readonly socket = `stuffbucket-test-${String(process.pid)}-${randomBytes(4).toString('hex')}`;
  private readonly outputByProjection = new Map<string, string>();
  private readonly exitsByProjection = new Map<string, number>();
  private readonly connector = new LocalPtyConnector();
  private readonly broker: TmuxProjectionBroker;

  constructor() {
    execFileSync('tmux', ['-L', this.socket, 'new-session', '-d', '-s', this.sessionId, '/bin/sh']);
    execFileSync('tmux', ['-L', this.socket, 'set-option', '-t', this.sessionId, 'status', 'off']);
    execFileSync('tmux', ['-L', this.socket, 'set-option', '-t', this.sessionId, 'allow-passthrough', 'on']);
    this.broker = new TmuxProjectionBroker({
      attach: ({ cols, rows }) => this.connector.connect({
        command: 'tmux',
        args: ['-L', this.socket, 'attach-session', '-t', this.sessionId],
        name: 'xterm-256color',
        cols,
        rows,
        cwd: homedir(),
        env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
      }),
      terminateSession: () => {
        spawnSync('tmux', ['-L', this.socket, 'kill-session', '-t', this.sessionId]);
      },
      emit: (_sessionId, projectionId, chunk) => {
        this.outputByProjection.set(
          projectionId,
          (this.outputByProjection.get(projectionId) ?? '') + chunk,
        );
      },
      onExit: (_sessionId, projectionId, exitCode) => {
        this.exitsByProjection.set(projectionId, exitCode);
      },
    });
  }

  attach(projectionId: string, cols = 80, rows = 24): boolean {
    return this.broker.attach({ sessionId: this.sessionId, projectionId, cols, rows });
  }

  focus(projectionId: string, cols = 80, rows = 24): number {
    const epoch = this.broker.focus(this.sessionId, projectionId, cols, rows);
    if (epoch === undefined) throw new Error(`Could not focus projection ${projectionId}.`);
    return epoch;
  }

  write(projectionId: string, epoch: number, data: string): boolean {
    return this.broker.write(this.sessionId, projectionId, epoch, data);
  }

  detach(projectionId: string): boolean {
    return this.broker.detach(this.sessionId, projectionId);
  }

  output(projectionId: string): string {
    return this.outputByProjection.get(projectionId) ?? '';
  }

  exitCode(projectionId: string): number | undefined {
    return this.exitsByProjection.get(projectionId);
  }

  geometry(): { cols: number; rows: number } | undefined {
    return this.broker.geometry(this.sessionId);
  }

  pane(format: string): string {
    return execFileSync(
      'tmux',
      ['-L', this.socket, 'display-message', '-p', '-t', this.sessionId, format],
      { encoding: 'utf8' },
    ).trim();
  }

  async untilOutput(projectionId: string, text: string): Promise<void> {
    await this.until(() => this.output(projectionId).includes(text), `output ${JSON.stringify(text)} on ${projectionId}`);
  }

  async untilExit(projectionId: string): Promise<void> {
    await this.until(() => this.exitCode(projectionId) !== undefined, `exit on ${projectionId}`);
  }

  async untilPane(format: string, expected: string): Promise<void> {
    await this.until(() => this.pane(format) === expected, `${format}=${expected}`);
  }

  close(): void {
    spawnSync('tmux', ['-L', this.socket, 'kill-server']);
  }

  private async until(predicate: () => boolean, description: string): Promise<void> {
    const deadline = Date.now() + WAIT_MS;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}