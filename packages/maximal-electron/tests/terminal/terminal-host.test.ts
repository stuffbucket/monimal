import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  TerminalHost,
  registerTerminalChannels,
  type TerminalChannelHost,
  type TerminalConnectOptions,
  type TerminalConnector,
  type TerminalProcess,
  type TerminalRequestChannels,
} from '../../src/host/terminal-host.js';
import { MAX_IN_FLIGHT_BYTES } from '../../src/main/native/pty-session.js';

function flowHost(pausable = true) {
  let data: (chunk: string) => void = () => {};
  let exit: (event: { exitCode: number }) => void = () => {};
  const calls: string[] = [];
  const output: Array<{ chunk: string; sequence?: number }> = [];
  const process: TerminalProcess = {
    onData: (listener) => {
      data = listener;
    },
    onExit: (listener) => {
      exit = listener;
    },
    write: () => undefined,
    resize: () => undefined,
    ...(pausable
      ? { pause: () => calls.push('pause'), resume: () => calls.push('resume') }
      : {}),
    kill: () => undefined,
  };
  const exits: number[] = [];
  const host = new TerminalHost({
    homeDirectory: '/home/test',
    defaultShell: '/bin/sh',
    connector: { connect: () => process },
    flowControl: true,
    flushMs: 1_000_000,
    emit: (_id, chunk, sequence) => output.push({ chunk, sequence }),
    onExit: (_id, exitCode) => exits.push(exitCode),
  });
  host.spawn({ id: 'one', cols: 80, rows: 24 });
  return {
    calls,
    emitData: (chunk: string) => data(chunk),
    emitExit: (exitCode: number) => exit({ exitCode }),
    exits,
    host,
    output,
  };
}

/**
 * Owner-scoped reaping, against real shells.
 *
 * `Owners` in `tests/terminal/pty-session.test.ts` proves the registry rule with fake
 * managers. This proves the thing the rule exists for: terminating one
 * manager kills its shell process and leaves another manager's alone. A map
 * entry disappearing is not the claim; a process ending is.
 *
 * POSIX only. The shell reports its own pid through `$$`, and `cmd.exe` has
 * no equivalent, so Windows is unverified here and the end-to-end suite says
 * the same.
 */

const POSIX = process.platform !== 'win32';

describe('TerminalHost connector', () => {
  it('delegates process operations while retaining session policy', () => {
    const calls: string[] = [];
    let connected: TerminalConnectOptions | undefined;
    let dataListener: (data: string) => void = () => {};
    let exitListener: (event: { exitCode: number }) => void = () => {};
    const terminalProcess: TerminalProcess = {
      onData: (listener) => {
        dataListener = listener;
      },
      onExit: (listener) => {
        exitListener = listener;
      },
      write: (data) => calls.push(`write ${data}`),
      resize: (cols, rows) => calls.push(`resize ${String(cols)}x${String(rows)}`),
      kill: () => calls.push('kill'),
    };
    const connector: TerminalConnector = {
      connect: (options) => {
        connected = options;
        return terminalProcess;
      },
    };
    const output: string[] = [];
    const exits: number[] = [];
    const host = new TerminalHost({
      homeDirectory: '/home/test',
      defaultShell: '/bin/test-shell',
      flushMs: 0,
      env: { TERM_PROGRAM: 'Test' },
      connector,
      emit: (_id, chunk) => output.push(chunk),
      onExit: (_id, exitCode) => exits.push(exitCode),
    });

    host.spawn({ id: 'one', cols: 0, rows: -1 });
    expect(connected).toMatchObject({
      command: '/bin/test-shell',
      args: [],
      name: 'xterm-256color',
      cols: 1,
      rows: 1,
      cwd: '/home/test',
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Test' },
    });
    expect(connected?.env['PATH']).toBe(process.env['PATH']);
    const [session] = host.list();
    expect(session).toMatchObject({
      id: 'one',
      cwd: '/home/test',
      shell: '/bin/test-shell',
    });
    expect(typeof session?.startedAt).toBe('number');

    host.write('one', 'hello');
    host.resize('one', 0, 4);
    dataListener('output');
    host.spawn({ id: 'one', cols: 9, rows: 5 });
    expect(calls).toEqual(['write hello', 'resize 1x4', 'resize 9x5']);

    host.terminate('one');
    exitListener({ exitCode: 7 });
    expect(calls).toContain('kill');
    expect(exits).toEqual([]);
    expect(host.list()).toEqual([]);
    expect(output).toEqual(['output']);
  });

  it('delivers data and exit events from an injected process', () => {
    let dataListener: (data: string) => void = () => {};
    let exitListener: (event: { exitCode: number }) => void = () => {};
    const terminalProcess: TerminalProcess = {
      onData: (listener) => {
        dataListener = listener;
      },
      onExit: (listener) => {
        exitListener = listener;
      },
      write: () => undefined,
      resize: () => undefined,
      kill: () => undefined,
    };
    const output: string[] = [];
    const exits: number[] = [];
    const host = new TerminalHost({
      homeDirectory: '/home/test',
      defaultShell: '/bin/test-shell',
      connector: { connect: () => terminalProcess },
      emit: (_id, chunk) => output.push(chunk),
      onExit: (_id, exitCode) => exits.push(exitCode),
    });

    host.spawn({ id: 'one', cols: 80, rows: 24 });
    dataListener('output');
    exitListener({ exitCode: 7 });

    expect(output).toEqual(['output']);
    expect(exits).toEqual([7]);
    expect(host.list()).toEqual([]);
  });

  it('reports registered sessions before current-generation exits only', () => {
    const exitListeners: Array<(event: { exitCode: number }) => void> = [];
    const statuses: string[] = [];
    const exits: string[] = [];
    const connector: TerminalConnector = {
      connect: () => ({
        onData: () => undefined,
        onExit: (listener) => exitListeners.push(listener),
        write: () => undefined,
        resize: () => undefined,
        kill: () => undefined,
      }),
    };
    const host = new TerminalHost({
      homeDirectory: '/home/test',
      defaultShell: '/bin/test-shell',
      connector,
      emit: () => undefined,
      onExit: (id, exitCode) => exits.push(`${id}:${String(exitCode)}`),
      onStatus: (status) => {
        statuses.push(
          status.state === 'started'
            ? `started:${status.session.id}`
            : `exited:${status.id}:${String(status.exitCode)}`,
        );
      },
    });

    host.spawn({ id: 'one', cols: 80, rows: 24 });
    host.terminate('one');
    host.spawn({ id: 'one', cols: 80, rows: 24 });
    exitListeners[0]!({ exitCode: 3 });
    exitListeners[1]!({ exitCode: 4 });

    expect(statuses).toEqual(['started:one', 'started:one', 'exited:one:4']);
    expect(exits).toEqual(['one:4']);
  });
});

describe('TerminalHost flow control', () => {
  it('bounds output and pauses then resumes with hysteresis', () => {
    const wire = flowHost();
    wire.emitData('a'.repeat(MAX_IN_FLIGHT_BYTES));
    wire.emitExit(0);

    expect(wire.output).toEqual([{ chunk: 'a'.repeat(MAX_IN_FLIGHT_BYTES), sequence: 1 }]);
    expect(wire.calls).toEqual(['pause']);
    expect(wire.exits).toEqual([]);

    wire.host.acknowledge('one', 1);
    expect(wire.calls).toEqual(['pause', 'resume']);
    expect(wire.exits).toEqual([0]);
  });

  it('keeps the newest bounded tail and emits one loss notice for a non-pausable process', () => {
    const wire = flowHost(false);
    wire.emitData('a'.repeat(MAX_IN_FLIGHT_BYTES));
    wire.emitExit(0);
    wire.emitData('b'.repeat(MAX_IN_FLIGHT_BYTES + 1));

    wire.host.acknowledge('one', 1);
    expect(wire.output).toHaveLength(2);
    expect(wire.output[1]?.chunk).toContain('characters dropped');
    expect(wire.output[1]?.chunk.length).toBeLessThanOrEqual(MAX_IN_FLIGHT_BYTES);
    expect(wire.output[1]?.chunk.endsWith('b')).toBe(true);
    expect(wire.exits).toEqual([]);

    wire.host.acknowledge('one', 2);
    expect(wire.exits).toEqual([0]);
  });

  it('ignores duplicate, stale, and future acknowledgements', () => {
    const wire = flowHost();
    wire.emitData('output');
    wire.emitExit(7);

    wire.host.acknowledge('one', 0);
    wire.host.acknowledge('one', 2);
    expect(wire.exits).toEqual([]);

    wire.host.acknowledge('one', 1);
    wire.host.acknowledge('one', 1);
    expect(wire.exits).toEqual([7]);
  });

  it('leaves output batching unchanged when acknowledgement flow control is absent', () => {
    const output: Array<{ chunk: string; sequence?: number }> = [];
    let data: (chunk: string) => void = () => {};
    const host = new TerminalHost({
      homeDirectory: '/home/test',
      defaultShell: '/bin/sh',
      flushMs: 1_000_000,
      connector: {
        connect: () => ({
          onData: (listener) => {
            data = listener;
          },
          onExit: () => undefined,
          write: () => undefined,
          resize: () => undefined,
          kill: () => undefined,
        }),
      },
      emit: (_id, chunk, sequence) => output.push({ chunk, sequence }),
      onExit: () => undefined,
    });
    host.spawn({ id: 'one', cols: 80, rows: 24 });
    data('output');
    host.terminate('one');

    expect(output).toEqual([]);
  });
});

/** Does a process still exist? Signal 0 checks without delivering anything. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(condition: () => boolean, budgetMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return condition();
}

/** One owner: a manager, its shell, and everything that shell has printed. */
function owner() {
  let output = '';
  const host = new TerminalHost({
    homeDirectory: homedir(),
    // `/bin/sh` rather than the login shell: no profile, no prompt theme, and
    // it exists on every POSIX runner.
    defaultShell: '/bin/sh',
    flushMs: 1,
    emit: (_id, chunk) => {
      output += chunk;
    },
    onExit: () => undefined,
  });

  host.spawn({ id: 'session', cols: 80, rows: 24 });
  host.write('session', 'echo PID:$$\n');

  return {
    host,
    /** The shell's own pid, once it has said it. */
    async pid(): Promise<number | undefined> {
      await until(() => /PID:(\d+)/.test(output), 20_000);
      const match = /PID:(\d+)/.exec(output);
      return match ? Number(match[1]) : undefined;
    },
  };
}

describe.skipIf(!POSIX)('TerminalHost, per owner', () => {
  it('reaps its own shells and leaves another owner\'s running', async () => {
    const closing = owner();
    const staying = owner();

    const closingPid = await closing.pid();
    const stayingPid = await staying.pid();

    // The floor. Without a real pid every assertion below inspects nothing,
    // and a test that finds no process would report the reaping as correct.
    expect(closingPid).toBeGreaterThan(0);
    expect(stayingPid).toBeGreaterThan(0);
    expect(closingPid).not.toBe(stayingPid);
    expect(alive(closingPid!)).toBe(true);
    expect(alive(stayingPid!)).toBe(true);

    // What a window closing does.
    closing.host.terminateAll();

    expect(await until(() => !alive(closingPid!))).toBe(true);
    expect(alive(stayingPid!)).toBe(true);

    staying.host.terminateAll();
    expect(await until(() => !alive(stayingPid!))).toBe(true);
  });

  it('keeps a session its view left, lists it, and attaches to it again', async () => {
    let output = '';
    const host = new TerminalHost({
      homeDirectory: homedir(),
      defaultShell: '/bin/sh',
      flushMs: 1,
      emit: (_id, chunk) => {
        output += chunk;
      },
      onExit: () => undefined,
    });

    host.spawn({ id: 'kept', cols: 80, rows: 24 });
    host.write('kept', 'echo PID:$$\n');
    await until(() => /PID:(\d+)/.test(output), 20_000);
    const pid = Number(/PID:(\d+)/.exec(output)?.[1]);

    // The floor. Without a real pid nothing below inspects a process at all.
    expect(pid).toBeGreaterThan(0);
    expect(alive(pid)).toBe(true);

    // The view goes away. Detach is the absence of a terminate, so nothing is
    // called here, and the session has to still be findable afterwards.
    const [session] = host.list();
    expect(session).toMatchObject({ id: 'kept', cwd: homedir(), shell: '/bin/sh' });
    expect(typeof session?.startedAt).toBe('number');
    expect(alive(pid)).toBe(true);

    output = '';
    host.spawn({ id: 'kept', cols: 100, rows: 30 });
    expect(await until(() => output.includes(`PID:${String(pid)}`))).toBe(true);

    // The same process, rather than a second one spawned under the same id.
    host.write('kept', 'echo AGAIN:$$\n');
    expect(await until(() => output.includes(`AGAIN:${String(pid)}`))).toBe(true);
    expect(host.list()).toHaveLength(1);

    // The owner still reaps it, which is what keeps a detach from being a leak.
    host.terminateAll();
    expect(await until(() => !alive(pid))).toBe(true);
    expect(host.list()).toEqual([]);
  });
});

/**
 * The registration a consumer wires onto their own `ipcMain`.
 *
 * Nothing here names a channel of this repository's: the names are the
 * caller's argument, so these use names no contract holds and a hard-coded one
 * would fail. `tests/terminal/terminal-channels.test.ts` is what pairs the names this
 * shell passes with the ones its renderer calls.
 */

const CHANNELS: TerminalRequestChannels = {
  spawn: 'consumer/open',
  write: 'consumer/write',
  resize: 'consumer/resize',
  terminate: 'consumer/close',
  list: 'consumer/list',
};
const CHANNEL_NAMES = [
  CHANNELS.spawn,
  CHANNELS.write,
  CHANNELS.resize,
  CHANNELS.terminate,
  CHANNELS.list,
];

/** An `ipcMain` that records rather than registers. */
function fakeIpcMain() {
  const handlers = new Map<string, (event: string, request: unknown) => unknown>();
  return {
    ipcMain: {
      handle(channel: string, listener: (event: string, request: unknown) => unknown) {
        handlers.set(channel, listener);
      },
    },
    handlers,
    invoke: (channel: string, event: string, request?: unknown) =>
      handlers.get(channel)?.(event, request),
  };
}

/** A manager that records rather than spawning. */
function fakeHost() {
  const calls: string[] = [];
  const host: TerminalChannelHost = {
    spawn: (request) => calls.push(`spawn ${request.id} ${String(request.cols)}x${String(request.rows)}`),
    write: (id, data) => calls.push(`write ${id} ${data}`),
    resize: (id, cols, rows) => calls.push(`resize ${id} ${String(cols)}x${String(rows)}`),
    terminate: (id) => calls.push(`terminate ${id}`),
    list: () => [{ id: 'kept', cwd: '/tmp', shell: '/bin/sh', startedAt: 17 }],
  };
  return { host, calls };
}

describe('registerTerminalChannels', () => {
  it('answers each of the five names it was given, and nothing else', () => {
    const wire = fakeIpcMain();
    registerTerminalChannels(wire.ipcMain, fakeHost().host, { channels: CHANNELS });

    // The floor. A registration that answered nothing would satisfy every
    // assertion below by holding an empty map.
    expect(wire.handlers.size).toBe(Object.keys(CHANNELS).length);
    expect([...wire.handlers.keys()].sort()).toEqual([...CHANNEL_NAMES].sort());
  });

  it('drives the manager from the request each channel carries', () => {
    const wire = fakeIpcMain();
    const { host, calls } = fakeHost();
    registerTerminalChannels(wire.ipcMain, host, { channels: CHANNELS });

    wire.invoke(CHANNELS.spawn, 'window', { id: 'one', cols: 80, rows: 24 });
    wire.invoke(CHANNELS.write, 'window', { id: 'one', data: 'ls\r' });
    wire.invoke(CHANNELS.resize, 'window', { id: 'one', cols: 100, rows: 40 });
    wire.invoke(CHANNELS.terminate, 'window', { id: 'one' });

    expect(calls).toEqual([
      'spawn one 80x24',
      'write one ls\r',
      'resize one 100x40',
      'terminate one',
    ]);
    expect(wire.invoke(CHANNELS.list, 'window')).toEqual([
      { id: 'kept', cwd: '/tmp', shell: '/bin/sh', startedAt: 17 },
    ]);
  });

  it('asks the caller which manager a request belongs to', () => {
    // One manager per window is what stops a window reaching another's
    // shells, so the registration resolves the manager per request.
    const wire = fakeIpcMain();
    const first = fakeHost();
    const second = fakeHost();
    const asked: string[] = [];

    registerTerminalChannels(
      wire.ipcMain,
      (event: string) => {
        asked.push(event);
        return event === 'first' ? first.host : second.host;
      },
      { channels: CHANNELS },
    );

    wire.invoke(CHANNELS.write, 'first', { id: 'one', data: 'a' });
    wire.invoke(CHANNELS.write, 'second', { id: 'one', data: 'b' });

    expect(asked).toEqual(['first', 'second']);
    expect(first.calls).toEqual(['write one a']);
    expect(second.calls).toEqual(['write one b']);
  });

  it('drops a request that reaches no manager, and lists no sessions', () => {
    // Nothing would reap a session opened for an owner that has gone.
    const wire = fakeIpcMain();
    const { calls } = fakeHost();
    registerTerminalChannels(wire.ipcMain, () => undefined, { channels: CHANNELS });

    for (const channel of CHANNEL_NAMES) {
      expect(() => wire.invoke(channel, 'gone', { id: 'one', data: 'a' })).not.toThrow();
    }

    expect(calls).toEqual([]);
    expect(wire.invoke(CHANNELS.list, 'gone')).toEqual([]);
  });
});
