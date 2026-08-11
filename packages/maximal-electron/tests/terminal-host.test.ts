import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { TerminalHost } from '../src/host/terminal-host.js';
import {
  registerTerminalChannels,
  type TerminalChannelHost,
  type TerminalRequestChannels,
} from '../src/host/terminal-host.js';

/**
 * Owner-scoped reaping, against real shells.
 *
 * `Owners` in `tests/pty-session.test.ts` proves the registry rule with fake
 * managers. This proves the thing the rule exists for: terminating one
 * manager kills its shell process and leaves another manager's alone. A map
 * entry disappearing is not the claim; a process ending is.
 *
 * POSIX only. The shell reports its own pid through `$$`, and `cmd.exe` has
 * no equivalent, so Windows is unverified here and the end-to-end suite says
 * the same.
 */

const POSIX = process.platform !== 'win32';

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
    expect(host.list()).toEqual([
      { id: 'kept', cwd: homedir(), shell: '/bin/sh', startedAt: expect.any(Number) },
    ]);
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
 * would fail. `tests/terminal-channels.test.ts` is what pairs the names this
 * shell passes with the ones its renderer calls.
 */

const CHANNELS: TerminalRequestChannels = {
  spawn: 'consumer/open',
  write: 'consumer/write',
  resize: 'consumer/resize',
  terminate: 'consumer/close',
  list: 'consumer/list',
};

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
    expect([...wire.handlers.keys()].sort()).toEqual([...Object.values(CHANNELS)].sort());
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

    for (const channel of Object.values(CHANNELS)) {
      expect(() => wire.invoke(channel, 'gone', { id: 'one', data: 'a' })).not.toThrow();
    }

    expect(calls).toEqual([]);
    expect(wire.invoke(CHANNELS.list, 'gone')).toEqual([]);
  });
});
