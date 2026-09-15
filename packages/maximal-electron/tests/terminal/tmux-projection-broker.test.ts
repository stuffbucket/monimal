import { describe, expect, it, vi } from 'vitest';

import {
  TmuxProjectionBroker,
  type TmuxProjectionProcess,
} from '../../src/host/tmux-projection-broker.js';

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
});