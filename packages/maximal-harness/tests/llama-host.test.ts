import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ fork: vi.fn() }));

vi.mock('electron', () => ({ utilityProcess: { fork: electron.fork } }));

import {
  configureLlamaHost,
  enginePhase,
  engineReleasedBy,
  engineStartup,
  listen,
  resetEngineBudget,
  send,
  stopEngine,
} from '../src/host/llama-host.js';
import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  describeEngineExit,
  exhaustedMessage,
} from '../src/host/llama-protocol.js';

class FakeUtilityProcess {
  readonly kill = vi.fn(() => true);
  readonly postMessage = vi.fn();
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: never[]) => void): this {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler as (...args: unknown[]) => void);
    this.handlers.set(event, handlers);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

const children: FakeUtilityProcess[] = [];

function latestChild(): FakeUtilityProcess {
  const child = children.at(-1);
  if (!child) throw new Error('No utility process was forked.');
  return child;
}

describe('llama utility-process supervisor', () => {
  beforeEach(() => {
    stopEngine();
    resetEngineBudget();
    children.length = 0;
    electron.fork.mockReset();
    electron.fork.mockImplementation(() => {
      const child = new FakeUtilityProcess();
      children.push(child);
      return child;
    });
    configureLlamaHost({ workerPath: '/app/llama-worker.js' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stopEngine();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('forks one named worker and records spawn readiness', () => {
    send({ kind: 'probe', id: 'probe-1' });

    expect(electron.fork).toHaveBeenCalledWith('/app/llama-worker.js', [], {
      serviceName: 'llama',
      stdio: 'pipe',
    });
    expect(enginePhase()).toBe('not started');
    expect(engineStartup()).toBe('spawn=no hello=no released-by=nothing queued=1');

    latestChild().emit('spawn');

    expect(enginePhase()).toBe('forked');
    expect(engineReleasedBy()).toBe('spawn');
    expect(engineStartup()).toBe('spawn=yes hello=no released-by=spawn queued=0');
  });

  it('accepts hello as readiness when it arrives before spawn', () => {
    send({ kind: 'probe', id: 'probe-1' });
    const child = latestChild();

    child.emit('message', { kind: 'hello', id: 'engine', pid: 42 });

    expect(enginePhase()).toBe('running');
    expect(engineReleasedBy()).toBe('hello');
    expect(engineStartup()).toBe('spawn=no hello=yes released-by=hello queued=0');

    child.emit('spawn');
    expect(enginePhase()).toBe('running');
    expect(engineReleasedBy()).toBe('hello');
  });

  it('releases queued requests in order exactly once, then sends directly', () => {
    const first = { kind: 'probe', id: 'probe-1' } as const;
    const second = { kind: 'cancel-download' } as const;
    const third = { kind: 'abort' } as const;

    send(first);
    send(second);
    const child = latestChild();
    expect(child.postMessage).not.toHaveBeenCalled();

    child.emit('spawn');
    child.emit('message', { kind: 'hello', id: 'engine', pid: 42 });
    send(third);

    expect(child.postMessage.mock.calls).toEqual([[first], [second], [third]]);
    expect(electron.fork).toHaveBeenCalledOnce();
  });

  it('propagates a worker crash to every pending request', () => {
    const first = vi.fn();
    const second = vi.fn();
    listen('turn-1', first);
    listen('turn-2', second);
    send({ kind: 'probe', id: 'turn-1' });

    latestChild().emit('exit', 6);

    const reason = describeEngineExit(6, process.platform);
    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith({ kind: 'failed', id: 'turn-1', reason });
    expect(second).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith({ kind: 'failed', id: 'turn-2', reason });
    expect(enginePhase()).toBe('not started');
    expect(engineStartup()).toBe('no engine');
  });

  it('removes pending requests after failing them', () => {
    const listener = vi.fn();
    listen('turn-1', listener);
    send({ kind: 'probe', id: 'turn-1' });
    const child = latestChild();

    child.emit('exit', 1);
    child.emit('message', { kind: 'delta', id: 'turn-1', text: 'late' });
    child.emit('exit', 1);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('stops restarting after the crash budget is spent and recovers after its window', () => {
    for (let index = 0; index < CRASH_LIMIT; index += 1) {
      send({ kind: 'probe', id: `probe-${String(index)}` });
      latestChild().emit('exit', 6);
    }

    expect(() => send({ kind: 'probe', id: 'over-budget' })).toThrow(
      exhaustedMessage(describeEngineExit(6, process.platform)),
    );
    expect(children).toHaveLength(CRASH_LIMIT);

    vi.advanceTimersByTime(CRASH_WINDOW_MS);
    send({ kind: 'probe', id: 'after-window' });

    expect(children).toHaveLength(CRASH_LIMIT + 1);
  });

  it('kills the worker and drops pending listeners during shutdown', () => {
    const listener = vi.fn();
    listen('turn-1', listener);
    send({ kind: 'probe', id: 'turn-1' });
    const child = latestChild();

    stopEngine();
    child.emit('message', { kind: 'delta', id: 'turn-1', text: 'late' });

    expect(child.kill).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
    expect(enginePhase()).toBe('not started');
    expect(engineStartup()).toBe('no engine');
  });

  it('ignores a stopped worker exit after its replacement starts', () => {
    send({ kind: 'probe', id: 'old' });
    const old = latestChild();
    stopEngine();

    const replacementListener = vi.fn();
    listen('replacement', replacementListener);
    send({ kind: 'probe', id: 'replacement' });
    const replacement = latestChild();

    old.emit('exit', 9);
    replacement.emit('spawn');
    replacement.emit('message', { kind: 'delta', id: 'replacement', text: 'ready' });

    expect(replacementListener).toHaveBeenCalledOnce();
    expect(replacementListener).toHaveBeenCalledWith({
      kind: 'delta',
      id: 'replacement',
      text: 'ready',
    });
    expect(engineStartup()).toBe('spawn=yes hello=no released-by=spawn queued=0');
  });
});
