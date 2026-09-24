import { describe, expect, it, vi } from 'vitest';

import {
  TmuxProjectionHost,
  configureTerminalDiagnostics,
  type TerminalConnectOptions,
  type TerminalProcess,
} from '../../src/host/terminal-host.js';

function processWire(): TerminalProcess & { writes: string[]; sizes: string[]; killed: ReturnType<typeof vi.fn> } {
  const killed = vi.fn();
  return {
    writes: [],
    sizes: [],
    killed,
    onData: vi.fn(),
    onExit: vi.fn(),
    write(data) { this.writes.push(data); },
    resize(cols, rows) { this.sizes.push(`${String(cols)}x${String(rows)}`); },
    kill: killed,
  };
}

async function tmuxCommand(_command: string, args: readonly string[]): Promise<{ stdout: string }> {
  if (args.includes('show-options')) return { stdout: 'latest\n' };
  const x = args.indexOf('-x');
  const y = args.indexOf('-y');
  return { stdout: x >= 0 && y >= 0 ? `${args[x + 1]}x${args[y + 1]}\n` : '' };
}

describe('TmuxProjectionHost', () => {
  it.each(['local', 'ssh'] as const)('logs %s lifecycle and failures with simulated commands, without target details', async (transport) => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failCommand = false;
    const host = new TmuxProjectionHost({
      homeDirectory: '/private-home',
      connector: { connect: () => processWire() },
      command: async (_command, args) => {
        if (failCommand) throw new Error('private-host command failed');
        return { stdout: args.join(' ').includes('show-options') ? 'latest\n' : '90x30\n' };
      },
      terminate: vi.fn(), emit: vi.fn(), onExit: vi.fn(), onGeometryError: vi.fn(),
    });
    try {
      configureTerminalDiagnostics(true);
      host.reserve('opaque-session', {
        command: transport === 'ssh' ? 'ssh' : 'tmux',
        args: ['private-command'], ownership: 'created',
        geometry: transport === 'ssh'
          ? { transport, alias: 'private-host', sessionName: 'private-session' }
          : { transport, sessionName: 'private-session' },
      });
      for (const projectionId of ['left', 'right']) {
        expect(host.attach({ sessionId: 'opaque-session', projectionId, cols: 90, rows: 30 })).toBe(true);
      }
      host.focus('opaque-session', 'left', 90, 30);
      await host.settleGeometry('opaque-session');
      expect(host.detach('opaque-session', 'right')).toBe(true);
      failCommand = true;
      host.focus('opaque-session', 'left', 90, 30);
      await host.settleGeometry('opaque-session');
      host.terminateAll();
      const records = log.mock.calls.map(([, json]) => JSON.parse(String(json)) as Record<string, unknown>);
      expect(records.length).toBeGreaterThan(0);
      expect(records).toContainEqual(expect.objectContaining({ event: 'reserved', transport, ownership: 'created' }));
      expect(records).toContainEqual(expect.objectContaining({ event: 'attach', accepted: true, projectionCount: 2 }));
      expect(records).toContainEqual(expect.objectContaining({ event: 'detach', accepted: true, projectionCount: 1 }));
      expect(records).toContainEqual(expect.objectContaining({ event: 'geometry-applied' }));
      expect(records).toContainEqual(expect.objectContaining({ event: 'command-failed' }));
      expect(records).toContainEqual(expect.objectContaining({ event: 'geometry-failed' }));
      expect(records.at(-1)).toMatchObject({ event: 'released', sessionCount: 0, projectionCount: 0 });
      expect(new Set(records.map((record) => record['ownerId'])).size).toBe(1);
      expect(JSON.stringify(records)).not.toContain('private-');
    } finally {
      configureTerminalDiagnostics(undefined);
      host.terminateAll();
      log.mockRestore();
    }
  });

  it('opens one trusted client per projection and terminates the session explicitly', () => {
    const processes = [processWire(), processWire()];
    const connections: TerminalConnectOptions[] = [];
    const terminate = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      env: { TERM_PROGRAM: 'Stuffbucket' },
      connector: {
        connect(options) {
          connections.push(options);
          return processes[connections.length - 1]!;
        },
      },
      command: tmuxCommand,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'private'],
      cwd: '/workspace',
      env: { SAFE: 'yes' },
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'private' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'private'] },
    });

    expect(host.has('work')).toBe(true);
    expect(host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
    expect(host.attach({ sessionId: 'work', projectionId: 'right', cols: 120, rows: 40 })).toBe(true);
    expect(connections.map(({ command, args, name, cols, rows, cwd }) => ({ command, args, name, cols, rows, cwd }))).toEqual([
      { command: 'tmux', args: ['new-session', '-A', '-s', 'private'], name: 'xterm-256color', cols: 80, rows: 24, cwd: '/workspace' },
      { command: 'tmux', args: ['new-session', '-A', '-s', 'private'], name: 'xterm-256color', cols: 80, rows: 24, cwd: '/workspace' },
    ]);
    expect(connections[0]?.env).toEqual(expect.objectContaining({ TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Stuffbucket', SAFE: 'yes' }));

    const leftEpoch = host.focus('work', 'left', 90, 30)!;
    const rightEpoch = host.focus('work', 'right', 100, 32)!;
    expect(host.write('work', 'left', leftEpoch, 'stale')).toBe(false);
    expect(host.write('work', 'right', rightEpoch, 'live')).toBe(true);
    expect(host.resize('work', 'left', leftEpoch, 120, 42)).toBe(false);
    expect(host.resize('work', 'right', rightEpoch, 110, 36)).toBe(true);
    expect(processes[1]?.writes).toEqual(['live']);
    expect(processes.map((process) => process.sizes)).toEqual([
      ['90x30', '100x32', '110x36'],
      ['90x30', '100x32', '110x36'],
    ]);

    expect(host.detach('work', 'right')).toBe(true);
    expect(processes[1]?.killed).toHaveBeenCalledOnce();
    expect(terminate).not.toHaveBeenCalled();
    expect(host.terminate('work')).toBe(true);
    expect(processes[0]?.killed).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'private']);
    expect(host.has('work')).toBe(false);
  });

  it('rejects unknown and duplicate reservations and terminates every reserved session', () => {
    const terminate = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command: tmuxCommand,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    const launch = {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'one'],
      ownership: 'created' as const,
      geometry: { transport: 'local' as const, sessionName: 'one' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'one'] },
    };

    expect(host.attach({ sessionId: 'missing', projectionId: 'left', cols: 80, rows: 24 })).toBe(false);
    host.reserve('one', launch);
    expect(() => host.reserve('one', launch)).toThrow('already exists');
    host.reserve('two', {
      ...launch,
      geometry: { transport: 'local', sessionName: 'two' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'two'] },
    });
    host.attach({ sessionId: 'one', projectionId: 'left', cols: 80, rows: 24 });
    host.attach({ sessionId: 'two', projectionId: 'right', cols: 80, rows: 24 });
    host.terminateAll();

    expect(terminate).toHaveBeenCalledTimes(2);
    expect(host.has('one')).toBe(false);
    expect(host.has('two')).toBe(false);
  });

  it('terminates a trusted reservation before its first projection attaches', () => {
    const terminate = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command: tmuxCommand,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'work'],
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'work' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] },
    });

    expect(host.terminate('missing')).toBe(false);
    expect(host.terminate('work')).toBe(true);
    expect(terminate).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'work']);
    expect(host.has('work')).toBe(false);
    expect(host.terminate('work')).toBe(false);
  });

  it('abandons projections without running trusted termination commands', () => {
    const process = processWire();
    const terminate = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => process },
      command: tmuxCommand,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'work'],
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'work' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    host.abandonAll();

    expect(process.killed).toHaveBeenCalledOnce();
    expect(terminate).not.toHaveBeenCalled();
    expect(host.has('work')).toBe(false);
  });

  it('sets and verifies manual server geometry then restores an existing session', async () => {
    const process = processWire();
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const command = vi.fn(async (executable: string, args: readonly string[]) => {
      calls.push({ command: executable, args });
      if (args.includes('show-options')) return { stdout: 'latest\n' };
      if (args.includes('display-message')) return { stdout: '101x33\n' };
      return { stdout: '' };
    });
    const terminate = vi.fn();
    const onGeometry = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => process },
      command,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
      onGeometry,
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'work'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'work' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    host.focus('work', 'left', 101, 33);
    await host.settleGeometry('work');

    expect(calls[0]).toEqual({
      command: 'tmux',
      args: ['show-options', '-wv', '-t', 'work', 'window-size'],
    });
    expect(calls[1]).toEqual({
      command: 'tmux',
      args: [
        'set-option', '-w', '-t', 'work', 'window-size', 'manual',
        ';',
        'resize-window', '-t', 'work', '-x', '101', '-y', '33',
        ';',
        'display-message', '-p', '-t', 'work', '#{window_width}x#{window_height}',
      ],
    });
    expect(onGeometry).toHaveBeenCalledWith('work', 101, 33);

    expect(host.detach('work', 'left')).toBe(true);
    await host.settleGeometry('work');
    expect(calls.at(-1)).toEqual({
      command: 'tmux',
      args: ['set-option', '-w', '-t', 'work', 'window-size', 'latest'],
    });
    expect(host.terminate('work')).toBe(true);
    expect(terminate).not.toHaveBeenCalled();
  });

  it('builds a fixed escaped remote tmux geometry command', async () => {
    const command = vi.fn(async (_executable: string, args: readonly string[]) => (
      args[1]?.includes('show-options')
        ? { stdout: 'smallest\n' }
        : { stdout: '90x28\n' }
    ));
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('remote', {
      command: 'ssh',
      args: ['-tt', 'host-1', 'tmux', 'attach-session', '-t', 'work'],
      ownership: 'existing',
      geometry: { transport: 'ssh', alias: 'host-1', sessionName: 'work' },
    });
    host.attach({ sessionId: 'remote', projectionId: 'left', cols: 80, rows: 24 });

    host.focus('remote', 'left', 90, 28);
    await host.settleGeometry('remote');

    expect(command).toHaveBeenLastCalledWith('ssh', [
      'host-1',
      "tmux set-option -w -t work window-size manual \\; resize-window -t work -x 90 -y 28 \\; display-message -p -t work '#{window_width}x#{window_height}'",
    ]);
  });

  it('reports created-session geometry failure without a timing retry', async () => {
    const command = vi.fn().mockRejectedValueOnce(new Error('no server yet'));
    const onGeometryError = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
      onGeometryError,
    });
    host.reserve('new', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'new'],
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'new' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'new'] },
    });
    host.attach({ sessionId: 'new', projectionId: 'left', cols: 80, rows: 24 });

    host.focus('new', 'left', 80, 24);

    await expect(host.settleGeometry('new')).resolves.toBeUndefined();
    expect(command).toHaveBeenCalledOnce();
    expect(onGeometryError).toHaveBeenCalledWith(
      'new',
      expect.objectContaining({ message: 'no server yet' }),
    );
  });
});