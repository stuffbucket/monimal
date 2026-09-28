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

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    await expect(host.settleGeometry('work')).resolves.toEqual({ cols: 101, rows: 33 });

    expect(calls.map((call) => call.args[0])).toEqual(['show-options', 'set-option']);
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

  it('reports created-session geometry failure without a timing retry', async () => {
    const command = vi.fn().mockRejectedValueOnce(new Error('no server yet'));
    const onGeometryError = vi.fn<(sessionId: string, error: unknown) => void>();
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

  it('keeps geometry error callbacks optional on the host boundary', async () => {
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command: vi.fn()
        .mockResolvedValueOnce({ stdout: 'latest\n' })
        .mockRejectedValueOnce(new Error('resize unavailable')),
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'work'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'work' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    host.focus('work', 'left', 80, 24);
    await expect(host.settleGeometry('work')).resolves.toBeUndefined();
  });

  it('does not turn a missing host geometry callback into a geometry error', async () => {
    const onGeometryError = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command: tmuxCommand,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
      onGeometryError,
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'work'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'work' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    host.focus('work', 'left', 80, 24);
    await expect(host.settleGeometry('work')).resolves.toEqual({ cols: 80, rows: 24 });
    expect(onGeometryError).not.toHaveBeenCalled();
  });

  it('restores existing-session geometry on explicit active termination but not created sessions', async () => {
    const calls: Array<readonly string[]> = [];
    const command = vi.fn(async (_executable: string, args: readonly string[]) => {
      calls.push(args);
      if (args.includes('show-options')) return { stdout: 'smallest\n' };
      return { stdout: '100x30\n' };
    });
    const terminate = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('existing', {
      command: 'tmux',
      args: ['attach-session', '-t', 'existing'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'existing' },
    });
    host.attach({ sessionId: 'existing', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('existing', 'left', 100, 30);
    await host.settleGeometry('existing');

    expect(host.terminate('existing')).toBe(true);
    await vi.waitFor(() => expect(calls.at(-1)).toEqual([
      'set-option', '-w', '-t', 'existing', 'window-size', 'smallest',
    ]));
    expect(terminate).not.toHaveBeenCalled();

    calls.length = 0;
    host.reserve('created', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'created'],
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'created' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'created'] },
    });
    host.attach({ sessionId: 'created', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('created', 'left', 100, 30);
    await host.settleGeometry('created');

    expect(host.terminate('created')).toBe(true);
    expect(calls.at(-1)).not.toEqual([
      'set-option', '-w', '-t', 'created', 'window-size', 'smallest',
    ]);
    expect(terminate).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'created']);
  });

  it('forgets created-session geometry on active termination instead of restoring it', async () => {
    const calls: Array<readonly string[]> = [];
    const command = vi.fn(async (_executable: string, args: readonly string[]) => {
      calls.push(args);
      if (args.includes('show-options')) return { stdout: 'latest\n' };
      if (args.includes('display-message')) return { stdout: '100x30\n' };
      return { stdout: '' };
    });
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('created', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'created'],
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'created' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'created'] },
    });
    host.attach({ sessionId: 'created', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('created', 'left', 100, 30);
    await host.settleGeometry('created');

    expect(host.terminate('created')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).not.toContainEqual(['set-option', '-w', '-t', 'created', 'window-size', 'latest']);
  });

  it('does not carry a created session geometry snapshot into a later reservation', async () => {
    const calls: Array<readonly string[]> = [];
    const command = vi.fn(async (_executable: string, args: readonly string[]) => {
      calls.push(args);
      if (args.includes('show-options')) return { stdout: args.includes('created') ? 'latest\n' : 'smallest\n' };
      return { stdout: '100x30\n' };
    });
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'created'],
      ownership: 'created',
      geometry: { transport: 'local', sessionName: 'created' },
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'created'] },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('work', 'left', 100, 30);
    await host.settleGeometry('work');
    expect(host.terminate('work')).toBe(true);

    calls.length = 0;
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'existing'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'existing' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('work', 'left', 90, 20);
    await host.settleGeometry('work');
    expect(host.detach('work', 'left')).toBe(true);
    await host.settleGeometry('work');

    expect(calls).toContainEqual(['show-options', '-wv', '-t', 'existing', 'window-size']);
    expect(calls.at(-1)).toEqual(['set-option', '-w', '-t', 'existing', 'window-size', 'smallest']);
  });

  it('does not carry a restored existing-session snapshot into a later reservation', async () => {
    const calls: Array<readonly string[]> = [];
    let nextPolicy = 'smallest';
    const command = vi.fn(async (_executable: string, args: readonly string[]) => {
      calls.push(args);
      if (args.includes('show-options')) return { stdout: `${nextPolicy}\n` };
      return { stdout: '100x30\n' };
    });
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'first'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'first' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('work', 'left', 100, 30);
    await host.settleGeometry('work');

    expect(host.terminate('work')).toBe(true);
    await vi.waitFor(() => expect(calls.at(-1)).toEqual([
      'set-option', '-w', '-t', 'first', 'window-size', 'smallest',
    ]));

    calls.length = 0;
    nextPolicy = 'largest';
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'second'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'second' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('work', 'left', 100, 30);
    await host.settleGeometry('work');
    expect(host.terminate('work')).toBe(true);
    await vi.waitFor(() => expect(calls.at(-1)).toEqual([
      'set-option', '-w', '-t', 'second', 'window-size', 'largest',
    ]));

    expect(calls).toContainEqual(['show-options', '-wv', '-t', 'second', 'window-size']);
  });

  it('handles an existing reservation with no projection or termination command', async () => {
    const command = vi.fn(async () => ({ stdout: '' }));
    const terminate = vi.fn();
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('existing', {
      command: 'tmux',
      args: ['attach-session', '-t', 'existing'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'existing' },
    });

    expect(host.terminate('existing')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(command).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
  });

  it('emits a released diagnostic when terminating a reservation with no projection', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command: vi.fn(async () => ({ stdout: '' })),
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    try {
      configureTerminalDiagnostics(true);
      host.reserve('reserved', {
        command: 'tmux',
        args: ['attach-session', '-t', 'reserved'],
        ownership: 'existing',
        geometry: { transport: 'local', sessionName: 'reserved' },
      });

      expect(host.terminate('reserved')).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const records = log.mock.calls.map(([, json]) => JSON.parse(String(json)) as Record<string, unknown>);
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'released',
        sessionId: 'reserved',
      }));
    } finally {
      configureTerminalDiagnostics(undefined);
      log.mockRestore();
    }
  });

  it('waits for an in-flight resize before restoring geometry on active termination', async () => {
    const firstResize = deferred<{ stdout: string }>();
    const calls: Array<readonly string[]> = [];
    const command = vi.fn((_executable: string, args: readonly string[]) => {
      calls.push(args);
      if (args.includes('show-options')) return Promise.resolve({ stdout: 'latest\n' });
      if (args.includes('resize-window')) return firstResize.promise;
      return Promise.resolve({ stdout: '' });
    });
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'work'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'work' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    host.focus('work', 'left', 100, 30);
    await vi.waitFor(() => expect(calls.filter((args) => args.includes('resize-window'))).toHaveLength(1));
    expect(host.terminate('work')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.filter((args) => args.includes('window-size') && args.includes('latest'))).toHaveLength(0);

    firstResize.resolve({ stdout: '100x30\n' });
    await vi.waitFor(() => expect(calls).toContainEqual([
      'set-option', '-w', '-t', 'work', 'window-size', 'latest',
    ]));
  });

  it('keeps a pending restore queued ahead of a reused session id', async () => {
    const firstResize = deferred<{ stdout: string }>();
    const restore = deferred<{ stdout: string }>();
    const calls: Array<readonly string[]> = [];
    const command = vi.fn((_executable: string, args: readonly string[]) => {
      calls.push(args);
      if (args.includes('show-options')) return Promise.resolve({ stdout: 'latest\n' });
      if (args.includes('resize-window')) {
        return args.includes('first') ? firstResize.promise : Promise.resolve({ stdout: '120x40\n' });
      }
      return restore.promise;
    });
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'first'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'first' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('work', 'left', 100, 30);
    await vi.waitFor(() => expect(calls.filter((args) => args.includes('resize-window'))).toHaveLength(1));
    expect(host.terminate('work')).toBe(true);

    firstResize.resolve({ stdout: '100x30\n' });
    await vi.waitFor(() => expect(calls).toContainEqual([
      'set-option', '-w', '-t', 'first', 'window-size', 'latest',
    ]));

    host.reserve('work', {
      command: 'tmux',
      args: ['attach-session', '-t', 'second'],
      ownership: 'existing',
      geometry: { transport: 'local', sessionName: 'second' },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    host.focus('work', 'left', 120, 40);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.filter((args) => args.includes('show-options') && args.includes('second'))).toHaveLength(0);

    restore.resolve({ stdout: '' });
    await host.settleGeometry('work');
    expect(calls).toContainEqual(['show-options', '-wv', '-t', 'second', 'window-size']);
  });

  it('removes completed command queues from later diagnostics', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: { connect: () => processWire() },
      command: tmuxCommand,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    try {
      configureTerminalDiagnostics(true);
      host.reserve('work', {
        command: 'tmux',
        args: ['attach-session', '-t', 'work'],
        ownership: 'existing',
        geometry: { transport: 'local', sessionName: 'work' },
      });
      host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
      host.focus('work', 'left', 100, 30);
      await host.settleGeometry('work');
      await vi.waitFor(() => {
        const completed = log.mock.calls
          .map(([, json]) => JSON.parse(String(json)) as Record<string, unknown>)
          .find((record) => record['event'] === 'command-completed' && record['sessionId'] === 'work');
        expect(completed).toBeDefined();
      });

      host.reserve('other', {
        command: 'tmux',
        args: ['attach-session', '-t', 'other'],
        ownership: 'existing',
        geometry: { transport: 'local', sessionName: 'other' },
      });

      const records = log.mock.calls.map(([, json]) => JSON.parse(String(json)) as Record<string, unknown>);
      expect(records).toContainEqual(expect.objectContaining({
        event: 'reserved',
        sessionId: 'other',
        commandQueueCount: 0,
      }));
    } finally {
      configureTerminalDiagnostics(undefined);
      host.terminateAll();
      log.mockRestore();
    }
  });

  it('emits exact diagnostic events and details for exit, failed attach, and queue completion', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let exit: (event: { exitCode: number }) => void = () => undefined;
    let connectFails = false;
    const process = {
      ...processWire(),
      onExit(listener: (event: { exitCode: number }) => void) { exit = listener; },
    };
    const host = new TmuxProjectionHost({
      homeDirectory: '/home/ada',
      connector: {
        connect: () => {
          if (connectFails) throw new Error('connect failed');
          return process;
        },
      },
      command: tmuxCommand,
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    try {
      configureTerminalDiagnostics(true);
      host.reserve('work', {
        command: 'tmux',
        args: ['attach-session', '-t', 'work'],
        ownership: 'existing',
        geometry: { transport: 'local', sessionName: 'work' },
      });
      host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
      host.focus('work', 'left', 80, 24);
      await host.settleGeometry('work');
      exit({ exitCode: 7 });
      host.reserve('failing', {
        command: 'tmux',
        args: ['attach-session', '-t', 'failing'],
        ownership: 'created',
        geometry: { transport: 'local', sessionName: 'failing' },
      });
      connectFails = true;
      expect(() => host.attach({ sessionId: 'failing', projectionId: 'right', cols: 80, rows: 24 })).toThrow('connect failed');
      host.terminate('failing');
      host.reserve('abandoned', {
        command: 'tmux',
        args: ['attach-session', '-t', 'abandoned'],
        ownership: 'created',
        geometry: { transport: 'local', sessionName: 'abandoned' },
      });
      connectFails = false;
      host.attach({ sessionId: 'abandoned', projectionId: 'left', cols: 80, rows: 24 });
      host.abandonAll();

      const records = log.mock.calls.map(([, json]) => JSON.parse(String(json)) as Record<string, unknown>);
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'command-completed',
        sessionId: 'work',
      }));
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'client-exited',
        sessionId: 'work',
        projectionId: 'left',
        exitCode: 7,
      }));
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'attach-failed',
        sessionId: 'failing',
        projectionId: 'right',
      }));
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'termination-requested',
        sessionId: 'failing',
      }));
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'abandon-requested',
        sessionId: 'abandoned',
      }));
      expect(records).toContainEqual(expect.objectContaining({
        component: 'tmux-host',
        event: 'released',
        sessionId: 'abandoned',
      }));
    } finally {
      configureTerminalDiagnostics(undefined);
      log.mockRestore();
    }
  });
});