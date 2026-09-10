import { describe, expect, it, vi } from 'vitest';

import {
  TmuxProjectionHost,
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

describe('TmuxProjectionHost', () => {
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
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'private'],
      cwd: '/workspace',
      env: { SAFE: 'yes' },
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
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    const launch = {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'one'],
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'one'] },
    };

    expect(host.attach({ sessionId: 'missing', projectionId: 'left', cols: 80, rows: 24 })).toBe(false);
    host.reserve('one', launch);
    expect(() => host.reserve('one', launch)).toThrow('already exists');
    host.reserve('two', { ...launch, terminate: { command: 'tmux', args: ['kill-session', '-t', 'two'] } });
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
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'work'],
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
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    host.reserve('work', {
      command: 'tmux',
      args: ['new-session', '-A', '-s', 'work'],
      terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] },
    });
    host.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    host.abandonAll();

    expect(process.killed).toHaveBeenCalledOnce();
    expect(terminate).not.toHaveBeenCalled();
    expect(host.has('work')).toBe(false);
  });
});