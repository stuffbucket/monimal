import { describe, expect, it, vi } from 'vitest';

import {
  TmuxProjectionBroker,
  type TmuxProjectionProcess,
} from '../../src/tmux/projection-broker.js';

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function processWire() {
  let data: (chunk: string) => void = () => undefined;
  let exit: (event: { exitCode: number }) => void = () => undefined;
  const calls: string[] = [];
  const process: TmuxProjectionProcess = {
    onData: (listener) => { data = listener; },
    onExit: (listener) => { exit = listener; },
    write: (value) => calls.push(`write:${value}`),
    resize: (cols, rows) => calls.push(`resize:${String(cols)}x${String(rows)}`),
    kill: () => calls.push('kill'),
  };
  return {
    calls,
    data: (chunk: string) => data(chunk),
    exit: (exitCode: number) => exit({ exitCode }),
    process,
  };
}

function geometryPolicy() {
  return {
    applyGeometry: async (_sessionId: string, cols: number, rows: number) => ({ cols, rows }),
    releaseGeometry: async () => undefined,
    onGeometry: () => undefined,
    onGeometryError: () => undefined,
  };
}

describe('TmuxProjectionBroker', () => {
  it('converges projections on one focus owner and canonical geometry', () => {
    const wires = [processWire(), processWire()];
    const attached: string[] = [];
    const terminated: string[] = [];
    const output: string[] = [];
    const exits: string[] = [];
    const broker = new TmuxProjectionBroker({
      ...geometryPolicy(),
      attach: ({ sessionId, projectionId, cols, rows }) => {
        attached.push(`${sessionId}:${projectionId}:${String(cols)}x${String(rows)}`);
        return wires[attached.length - 1]!.process;
      },
      terminateSession: (sessionId) => terminated.push(sessionId),
      emit: (sessionId, projectionId, chunk) => output.push(`${sessionId}:${projectionId}:${chunk}`),
      onExit: (sessionId, projectionId, exitCode) => exits.push(`${sessionId}:${projectionId}:${String(exitCode)}`),
    });

    expect(broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
    expect(broker.attach({ sessionId: 'work', projectionId: 'right', cols: 120, rows: 40 })).toBe(true);
    expect(attached).toEqual(['work:left:80x24', 'work:right:80x24']);

    wires[0]!.data('left output');
    wires[1]!.data('right output');
    expect(output).toEqual(['work:left:left output', 'work:right:right output']);

    const leftEpoch = broker.focus('work', 'left', 90, 30);
    const rightEpoch = broker.focus('work', 'right', 100, 32);
    expect(leftEpoch).toBe(1);
    expect(rightEpoch).toBe(2);
    expect(wires[0]!.calls).toEqual(['resize:90x30', 'resize:100x32']);
    expect(wires[1]!.calls).toEqual(['resize:90x30', 'resize:100x32']);

    expect(broker.write('work', 'left', leftEpoch!, 'stale')).toBe(false);
    expect(broker.resize('work', 'left', leftEpoch!, 70, 20)).toBe(false);
    expect(broker.write('work', 'right', rightEpoch!, 'hello')).toBe(true);
    expect(broker.resize('work', 'right', rightEpoch!, 110, 34)).toBe(true);
    expect(wires[0]!.calls.at(-1)).toBe('resize:110x34');
    expect(wires[1]!.calls.slice(-2)).toEqual(['write:hello', 'resize:110x34']);

    expect(broker.detach('work', 'right')).toBe(true);
    expect(wires[1]!.calls.at(-1)).toBe('kill');
    expect(terminated).toEqual([]);
    expect(broker.write('work', 'right', rightEpoch!, 'after detach')).toBe(false);
    wires[1]!.data('stale output');
    expect(output).toHaveLength(2);

    wires[1]!.exit(0);
    expect(exits).toEqual([]);
    expect(broker.terminate('work')).toBe(true);
    expect(wires[0]!.calls.at(-1)).toBe('kill');
    expect(terminated).toEqual(['work']);
    expect(broker.geometry('work')).toBeUndefined();
    expect(broker.terminate('work')).toBe(false);
  });

  it('rejects absent and stale owners and permits a projection identity to be reused', async () => {
    const first = processWire();
    const second = processWire();
    const processes = [first.process, second.process];
    const exits: string[] = [];
    const output: string[] = [];
    const broker = new TmuxProjectionBroker({
      ...geometryPolicy(),
      attach: () => processes.shift()!,
      terminateSession: () => undefined,
      emit: (_sessionId, _projectionId, chunk) => output.push(chunk),
      onExit: (sessionId, projectionId, exitCode) => exits.push(`${sessionId}:${projectionId}:${String(exitCode)}`),
    });

    expect(broker.focus('missing', 'left', 80, 24)).toBeUndefined();
    expect(broker.write('missing', 'left', 1, 'x')).toBe(false);
    expect(broker.resize('missing', 'left', 1, 80, 24)).toBe(false);
    expect(broker.detach('missing', 'left')).toBe(false);

    expect(broker.attach({ sessionId: 'work', projectionId: 'left', cols: 0, rows: -1 })).toBe(true);
    expect(broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(false);
    expect(broker.geometry('work')).toBeUndefined();
    expect(broker.focus('work', 'missing', 80, 24)).toBeUndefined();
    expect(broker.detach('work', 'missing')).toBe(false);

    const epoch = broker.focus('work', 'left', 0, 0)!;
    await broker.settleGeometry('work');
    expect(broker.geometry('work')).toEqual({ cols: 1, rows: 1 });
    expect(first.calls).toEqual(['resize:1x1']);
    expect(broker.write('work', 'other', epoch, 'wrong owner')).toBe(false);
    expect(broker.write('work', 'left', epoch + 1, 'wrong epoch')).toBe(false);
    first.exit(7);

    expect(exits).toEqual(['work:left:7']);
    expect(broker.write('work', 'left', epoch, 'after exit')).toBe(false);
    expect(broker.attach({ sessionId: 'work', projectionId: 'left', cols: 90, rows: 30 })).toBe(true);
    first.data('stale');
    first.exit(8);
    second.data('live');
    expect(output).toEqual(['live']);
    expect(exits).toEqual(['work:left:7']);
    expect(broker.focus('work', 'left', 90, 30)).toBe(3);
  });

  it('keeps the focus epoch when an observing projection detaches', () => {
    const left = processWire();
    const right = processWire();
    const replacement = processWire();
    const processes = [left.process, right.process, replacement.process];
    const broker = new TmuxProjectionBroker({
      ...geometryPolicy(),
      attach: () => processes.shift()!,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
    });

    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    broker.attach({ sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 });
    const epoch = broker.focus('work', 'right', 80, 24)!;

    expect(broker.detach('work', 'left')).toBe(true);
    expect(broker.write('work', 'right', epoch, 'still focused')).toBe(true);
    expect(right.calls.at(-1)).toBe('write:still focused');

    expect(broker.detach('work', 'right')).toBe(true);
    expect(broker.attach({ sessionId: 'work', projectionId: 'right', cols: 90, rows: 30 })).toBe(true);
    expect(broker.focus('work', 'right', 90, 30)).toBe(3);
  });

  it('preserves focus when an observer exits and invalidates it when the owner exits', () => {
    const observer = processWire();
    const owner = processWire();
    const replacement = processWire();
    const processes = [observer.process, owner.process, replacement.process];
    const broker = new TmuxProjectionBroker({
      ...geometryPolicy(),
      attach: () => processes.shift()!,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
    });

    broker.attach({ sessionId: 'work', projectionId: 'observer', cols: 80, rows: 24 });
    broker.attach({ sessionId: 'work', projectionId: 'owner', cols: 80, rows: 24 });
    const epoch = broker.focus('work', 'owner', 80, 24)!;

    observer.exit(0);
    expect(broker.write('work', 'owner', epoch, 'after observer exit')).toBe(true);

    owner.exit(0);
    broker.attach({ sessionId: 'work', projectionId: 'owner', cols: 80, rows: 24 });
    expect(broker.focus('work', 'owner', 80, 24)).toBe(3);
  });

  it('abandons client projections without terminating the tmux session', () => {
    const wire = processWire();
    const terminateSession = vi.fn();
    const broker = new TmuxProjectionBroker({
      ...geometryPolicy(),
      attach: () => wire.process,
      terminateSession,
      emit: () => undefined,
      onExit: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    expect(broker.abandon('work')).toBe(true);
    expect(wire.calls).toEqual(['kill']);
    expect(terminateSession).not.toHaveBeenCalled();
    expect(broker.abandon('work')).toBe(false);
  });

  it('publishes and applies only geometry confirmed by the tmux server', async () => {
    const wire = processWire();
    const onGeometry = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async () => ({ cols: 79, rows: 23 }),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 100, 30);
    expect(broker.geometry('work')).toBeUndefined();
    await broker.settleGeometry('work');

    expect(broker.geometry('work')).toEqual({ cols: 79, rows: 23 });
    expect(wire.calls).toEqual(['resize:100x30', 'resize:79x23']);
    expect(onGeometry).toHaveBeenCalledWith('work', 79, 23);
  });

  it('releases server geometry only after the final projection closes and reports release errors', async () => {
    const first = processWire();
    const second = processWire();
    const releaseGeometry = vi.fn(async () => {
      throw new Error('restore refused');
    });
    const onGeometryError = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: ({ projectionId }) => projectionId === 'first' ? first.process : second.process,
      applyGeometry: async (_sessionId, cols, rows) => ({ cols, rows }),
      releaseGeometry,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError,
    });
    broker.attach({ sessionId: 'work', projectionId: 'first', cols: 80, rows: 24 });
    broker.attach({ sessionId: 'work', projectionId: 'second', cols: 80, rows: 24 });
    broker.focus('work', 'first', 90, 30);
    await broker.settleGeometry('work');

    first.exit(0);
    await broker.settleGeometry('work');
    expect(releaseGeometry).not.toHaveBeenCalled();
    expect(broker.geometry('work')).toEqual({ cols: 90, rows: 30 });

    second.exit(0);
    await broker.settleGeometry('work');
    expect(releaseGeometry).toHaveBeenCalledWith('work');
    expect(broker.geometry('work')).toBeUndefined();
    expect(onGeometryError).toHaveBeenCalledWith(
      'work',
      expect.objectContaining({ message: 'restore refused' }),
    );
  });

  it('keeps server geometry while sibling projections remain after detach', async () => {
    const first = processWire();
    const second = processWire();
    const releaseGeometry = vi.fn(async () => undefined);
    const broker = new TmuxProjectionBroker({
      attach: ({ projectionId }) => projectionId === 'first' ? first.process : second.process,
      applyGeometry: async (_sessionId, cols, rows) => ({ cols, rows }),
      releaseGeometry,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'first', cols: 80, rows: 24 });
    broker.attach({ sessionId: 'work', projectionId: 'second', cols: 80, rows: 24 });
    broker.focus('work', 'first', 90, 30);
    await broker.settleGeometry('work');

    expect(broker.detach('work', 'first')).toBe(true);
    await broker.settleGeometry('work');
    expect(releaseGeometry).not.toHaveBeenCalled();
    expect(broker.geometry('work')).toEqual({ cols: 90, rows: 30 });

    expect(broker.detach('work', 'second')).toBe(true);
    await broker.settleGeometry('work');
    expect(releaseGeometry).toHaveBeenCalledWith('work');
  });

  it('ignores stale geometry replies after a newer focus revision wins', async () => {
    const wire = processWire();
    const firstReply = deferred<{ cols: number; rows: number }>();
    const secondReply = deferred<{ cols: number; rows: number }>();
    const replies = [firstReply, secondReply];
    const onGeometry = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: vi.fn(() => replies.shift()!.promise),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 90, 30);
    broker.focus('work', 'left', 120, 40);
    firstReply.resolve({ cols: 90, rows: 30 });
    await Promise.resolve();
    secondReply.resolve({ cols: 118, rows: 39 });
    await broker.settleGeometry('work');

    expect(onGeometry).toHaveBeenCalledOnce();
    expect(onGeometry).toHaveBeenCalledWith('work', 118, 39);
    expect(broker.geometry('work')).toEqual({ cols: 118, rows: 39 });
    expect(wire.calls).toEqual(['resize:90x30', 'resize:120x40', 'resize:118x39']);
  });

  it('does not let abandoned geometry work update a replacement session', async () => {
    const oldWire = processWire();
    const newWire = processWire();
    const firstGeometry = deferred<{ cols: number; rows: number }>();
    const onGeometry = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: ({ projectionId }) => projectionId === 'old' ? oldWire.process : newWire.process,
      applyGeometry: (_sessionId: string, cols: number, rows: number) =>
        projectionIdFromSize(cols, rows) === 'old' ? firstGeometry.promise : Promise.resolve({ cols, rows }),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'old', cols: 80, rows: 24 });
    broker.focus('work', 'old', 90, 30);
    expect(broker.terminate('work')).toBe(true);
    broker.attach({ sessionId: 'work', projectionId: 'new', cols: 100, rows: 40 });
    broker.focus('work', 'new', 100, 40);
    firstGeometry.resolve({ cols: 90, rows: 30 });
    await broker.settleGeometry('work');

    expect(onGeometry).toHaveBeenCalledOnce();
    expect(onGeometry).toHaveBeenCalledWith('work', 100, 40);
    expect(broker.geometry('work')).toEqual({ cols: 100, rows: 40 });
    expect(oldWire.calls).toEqual(['resize:90x30', 'kill']);
    expect(newWire.calls).toEqual(['resize:100x40']);
  });

  it('settles a removed session to undefined even when its queued geometry later resolves', async () => {
    const wire = processWire();
    const geometry = deferred<{ cols: number; rows: number }>();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: () => geometry.promise,
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    broker.focus('work', 'left', 90, 30);
    const settling = broker.settleGeometry('work');
    expect(broker.terminate('work')).toBe(true);

    geometry.resolve({ cols: 90, rows: 30 });

    await expect(settling).resolves.toBeUndefined();
    await expect(broker.settleGeometry('missing')).resolves.toBeUndefined();
  });

  it('ignores geometry success and failure after a session is empty or stale', async () => {
    const wire = processWire();
    const geometry = deferred<{ cols: number; rows: number }>();
    const staleError = deferred<{ cols: number; rows: number }>();
    let geometryCalls = 0;
    const onGeometry = vi.fn();
    const onGeometryError = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: () => {
        geometryCalls += 1;
        if (geometryCalls === 1) return geometry.promise;
        if (geometryCalls === 2) return staleError.promise;
        return Promise.resolve({ cols: 101, rows: 41 });
      },
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry,
      onGeometryError,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    broker.focus('work', 'left', 90, 30);
    expect(broker.detach('work', 'left')).toBe(true);
    geometry.resolve({ cols: 90, rows: 30 });
    await broker.settleGeometry('work');
    expect(onGeometry).not.toHaveBeenCalled();

    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    broker.focus('work', 'left', 100, 40);
    broker.focus('work', 'left', 101, 41);
    staleError.reject(new Error('stale resize failed'));
    await broker.settleGeometry('work');

    expect(onGeometry).toHaveBeenCalledWith('work', 101, 41);
    expect(onGeometryError).not.toHaveBeenCalledWith(
      'work',
      expect.objectContaining({ message: 'stale resize failed' }),
    );
  });

  it('does not let a stale empty-session resize overwrite a later active resize', async () => {
    const staleWire = processWire();
    const liveWire = processWire();
    const staleGeometry = deferred<{ cols: number; rows: number }>();
    const onGeometry = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: ({ projectionId }) => projectionId === 'stale' ? staleWire.process : liveWire.process,
      applyGeometry: (_sessionId, cols, rows) =>
        cols === 90 && rows === 30 ? staleGeometry.promise : Promise.resolve({ cols, rows }),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'stale', cols: 80, rows: 24 });
    broker.focus('work', 'stale', 90, 30);
    expect(broker.detach('work', 'stale')).toBe(true);
    broker.attach({ sessionId: 'work', projectionId: 'live', cols: 100, rows: 40 });
    broker.focus('work', 'live', 100, 40);

    staleGeometry.resolve({ cols: 90, rows: 30 });
    await broker.settleGeometry('work');

    expect(broker.geometry('work')).toEqual({ cols: 100, rows: 40 });
    expect(onGeometry).toHaveBeenCalledOnce();
    expect(liveWire.calls).toEqual(['resize:100x40']);
  });

  it('uses requested dimensions directly when no server geometry policy is installed', async () => {
    const wire = processWire();
    const onGeometry = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 0, rows: 0 });

    broker.focus('work', 'left', 0, -10);
    await broker.settleGeometry('work');

    expect(wire.calls).toEqual(['resize:1x1']);
    expect(broker.geometry('work')).toEqual({ cols: 1, rows: 1 });
    expect(onGeometry).toHaveBeenCalledWith('work', 1, 1);
  });

  it('reconciles projections when only the confirmed row count changes', async () => {
    const wire = processWire();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, cols) => ({ cols, rows: 23 }),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 80, 24);
    await broker.settleGeometry('work');

    expect(wire.calls).toEqual(['resize:80x24', 'resize:80x23']);
    expect(broker.geometry('work')).toEqual({ cols: 80, rows: 23 });
  });

  it('reconciles projections when only the confirmed column count changes', async () => {
    const wire = processWire();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, _cols, rows) => ({ cols: 79, rows }),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 80, 24);
    await broker.settleGeometry('work');

    expect(wire.calls).toEqual(['resize:80x24', 'resize:79x24']);
    expect(broker.geometry('work')).toEqual({ cols: 79, rows: 24 });
  });

  it('keeps optional geometry hooks optional', async () => {
    const wire = processWire();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async () => { throw new Error('resize unavailable'); },
      releaseGeometry: async () => { throw new Error('release unavailable'); },
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 90, 30);
    await expect(broker.settleGeometry('work')).resolves.toBeUndefined();
    expect(broker.detach('work', 'left')).toBe(true);
    await expect(broker.settleGeometry('work')).resolves.toBeUndefined();
  });

  it('does not report a release failure after the session has been terminated', async () => {
    const wire = processWire();
    const release = deferred<void>();
    const onGeometryError = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, cols, rows) => ({ cols, rows }),
      releaseGeometry: () => release.promise,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    expect(broker.detach('work', 'left')).toBe(true);
    expect(broker.terminate('work')).toBe(true);

    release.reject(new Error('late restore failed'));
    await expect(broker.settleGeometry('work')).resolves.toBeUndefined();
    expect(onGeometryError).not.toHaveBeenCalled();
  });

  it('settles a superseded session to undefined even when old geometry existed', async () => {
    const wire = processWire();
    const pending = deferred<{ cols: number; rows: number }>();
    let call = 0;
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, cols, rows) => {
        call += 1;
        return call === 1 ? { cols, rows } : pending.promise;
      },
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    broker.focus('work', 'left', 90, 30);
    await expect(broker.settleGeometry('work')).resolves.toEqual({ cols: 90, rows: 30 });

    broker.focus('work', 'left', 100, 40);
    const settling = broker.settleGeometry('work');
    expect(broker.terminate('work')).toBe(true);
    pending.resolve({ cols: 100, rows: 40 });

    await expect(settling).resolves.toBeUndefined();
  });

  it('does not report a geometry failure after the session has been terminated', async () => {
    const wire = processWire();
    const pending = deferred<{ cols: number; rows: number }>();
    const applyGeometry = vi.fn(() => pending.promise);
    const onGeometryError = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 90, 30);
    const settling = broker.settleGeometry('work');
    expect(broker.terminate('work')).toBe(true);

    await expect(settling).resolves.toBeUndefined();
    expect(applyGeometry).not.toHaveBeenCalled();
    expect(onGeometryError).not.toHaveBeenCalled();
  });

  it('does not turn a missing geometry callback into a geometry error', async () => {
    const wire = processWire();
    const onGeometryError = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, cols, rows) => ({ cols, rows }),
      releaseGeometry: async () => undefined,
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometryError,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 80, 24);
    await broker.settleGeometry('work');
    expect(onGeometryError).not.toHaveBeenCalled();
  });

  it('does not require geometry or release callbacks when dimensions succeed', async () => {
    const wire = processWire();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, cols, rows) => ({ cols, rows }),
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    broker.focus('work', 'left', 80, 24);
    await expect(broker.settleGeometry('work')).resolves.toEqual({ cols: 80, rows: 24 });
    expect(broker.detach('work', 'left')).toBe(true);
    await expect(broker.settleGeometry('work')).resolves.toBeUndefined();
  });

  it('does not report an error when no release callback is installed', async () => {
    const wire = processWire();
    const onGeometryError = vi.fn();
    const broker = new TmuxProjectionBroker({
      attach: () => wire.process,
      applyGeometry: async (_sessionId, cols, rows) => ({ cols, rows }),
      terminateSession: () => undefined,
      emit: () => undefined,
      onExit: () => undefined,
      onGeometry: () => undefined,
      onGeometryError,
    });
    broker.attach({ sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    expect(broker.detach('work', 'left')).toBe(true);
    await broker.settleGeometry('work');
    expect(onGeometryError).not.toHaveBeenCalled();
  });
});

function projectionIdFromSize(cols: number, rows: number): 'old' | 'new' {
  return cols === 90 && rows === 30 ? 'old' : 'new';
}