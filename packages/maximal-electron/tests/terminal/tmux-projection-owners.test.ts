import { describe, expect, it, vi } from 'vitest';

import {
  TmuxProjectionOwners,
  type TerminalProcess,
} from '../../src/host/terminal-host.js';

function processWire() {
  let data: (chunk: string) => void = () => undefined;
  let exit: (event: { exitCode: number }) => void = () => undefined;
  const process: TerminalProcess = {
    onData: (listener) => { data = listener; },
    onExit: (listener) => { exit = listener; },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  return {
    process,
    data: (chunk: string) => data(chunk),
    exit: (exitCode: number) => exit({ exitCode }),
  };
}

const launch = {
  command: 'tmux',
  args: ['attach-session', '-t', 'work'],
  terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] },
};

describe('TmuxProjectionOwners', () => {
  it('fans one session out to N isolated owners and releases only one owner', () => {
    const owners = Array.from({ length: 4 }, (_, index) => ({ id: `window-${String(index)}` }));
    const wires = owners.map(() => processWire());
    const pending = [...wires];
    const output: string[] = [];
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: (owner, sessionId, projectionId, chunk) => output.push(`${owner.id}:${sessionId}:${projectionId}:${chunk}`),
      onExit: vi.fn(),
    });
    registry.reserve(owners[0]!, 'work', launch);

    expect(registry.attach(owners[0]!, { sessionId: 'work', projectionId: 'view-0', cols: 80, rows: 24 })).toBe(true);
    for (let index = 1; index < owners.length; index += 1) {
      expect(registry.attach(owners[index]!, { sessionId: 'work', projectionId: `view-${String(index)}`, cols: 80, rows: 24 })).toBe(false);
      expect(registry.grant(owners[0]!, 'work', owners[index]!)).toBe(true);
      expect(registry.attach(owners[index]!, { sessionId: 'work', projectionId: `view-${String(index)}`, cols: 80, rows: 24 })).toBe(true);
    }

    expect(pending).toHaveLength(0);
    registry.release(owners[1]!);
    expect(wires[1]?.process.kill).toHaveBeenCalledOnce();
    expect(wires[0]?.process.kill).not.toHaveBeenCalled();
    expect(wires[2]?.process.kill).not.toHaveBeenCalled();
    expect(wires[3]?.process.kill).not.toHaveBeenCalled();
    expect(registry.has('work')).toBe(true);
    expect(registry.focus(owners[1]!, 'work', 'view-1', 80, 24)).toBeUndefined();
    expect(registry.focus(owners[2]!, 'work', 'view-2', 80, 24)).toBe(1);
  });

  it('routes bytes only to the projection owner and rejects another owner', () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const wires = [processWire(), processWire()];
    const pending = [...wires];
    const output: string[] = [];
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: (owner, _sessionId, projectionId, chunk) => output.push(`${owner.id}:${projectionId}:${chunk}`),
      onExit: vi.fn(),
    });
    registry.reserve(first, 'work', launch);
    registry.attach(first, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    registry.grant(first, 'work', second);
    registry.attach(second, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 });

    expect(registry.focus(first, 'work', 'right', 80, 24)).toBeUndefined();
    expect(registry.write(second, 'work', 'left', 1, 'wrong')).toBe(false);
    wires[0]?.data('left-output');
    wires[1]?.data('right-output');
    expect(output).toEqual(['first:left:left-output', 'second:right:right-output']);
  });

  it('forwards controls only for the current projection owner and epoch', () => {
    const owner = { id: 'owner' };
    const stranger = { id: 'stranger' };
    const wire = processWire();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => wire.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(owner, 'work', launch);
    expect(registry.attach(owner, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
    const epoch = registry.focus(owner, 'work', 'left', 100, 30)!;

    expect(registry.write(owner, 'work', 'left', epoch, 'live')).toBe(true);
    expect(registry.resize(owner, 'work', 'left', epoch, 120, 40)).toBe(true);
    expect(registry.resize(owner, 'work', 'left', epoch - 1, 90, 20)).toBe(false);
    expect(registry.resize(stranger, 'work', 'left', epoch, 90, 20)).toBe(false);
    expect(wire.process.write).toHaveBeenCalledWith('live');
    expect(wire.process.resize).toHaveBeenLastCalledWith(120, 40);
    expect(registry.detach(stranger, 'work', 'left')).toBe(false);
    expect(registry.detach(owner, 'work', 'left')).toBe(true);
    expect(registry.detach(owner, 'work', 'left')).toBe(false);
  });

  it('requires and consumes grants while allowing an attached owner to delegate', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const delegate = { id: 'delegate' };
    const stranger = { id: 'stranger' };
    const pending = [processWire(), processWire(), processWire()];
    const connect = vi.fn(() => pending.shift()!.process);
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'work', launch);
    registry.attach(creator, { sessionId: 'work', projectionId: 'creator', cols: 80, rows: 24 });

    expect(registry.grant(stranger, 'work', recipient)).toBe(false);
    expect(registry.grant(creator, 'work', recipient)).toBe(true);
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'recipient', cols: 80, rows: 24 })).toBe(true);
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'second', cols: 80, rows: 24 })).toBe(false);
    expect(registry.grant(recipient, 'work', delegate)).toBe(true);
    expect(registry.attach(delegate, { sessionId: 'work', projectionId: 'delegate', cols: 80, rows: 24 })).toBe(true);
    expect(registry.attach(creator, { sessionId: 'work', projectionId: 'creator', cols: 80, rows: 24 })).toBe(false);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(registry.focus(creator, 'work', 'creator', 80, 24)).toBe(1);
  });

  it('rolls ownership back when a connector throws and consumes the one-time grant', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => { throw new Error('connect failed'); } },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'work', launch);
    registry.grant(creator, 'work', recipient);

    expect(() => registry.attach(recipient, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 })).toThrow('connect failed');
    expect(registry.focus(recipient, 'work', 'right', 80, 24)).toBeUndefined();
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 })).toBe(false);
    registry.grant(creator, 'work', recipient);
    expect(() => registry.attach(recipient, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 })).toThrow('connect failed');
  });

  it('routes exit once and removes ownership before stale process callbacks', () => {
    const creator = { id: 'creator' };
    const owner = { id: 'owner' };
    const wire = processWire();
    const output = vi.fn();
    const exited = vi.fn();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => wire.process },
      terminate: vi.fn(),
      emit: output,
      onExit: exited,
    });
    registry.reserve(creator, 'work', launch);
    registry.grant(creator, 'work', owner);
    registry.attach(owner, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    wire.exit(17);
    expect(exited).toHaveBeenCalledWith(owner, 'work', 'left', 17);
    expect(registry.focus(owner, 'work', 'left', 80, 24)).toBeUndefined();
    expect(registry.grant(owner, 'work', { id: 'recipient' })).toBe(false);
    wire.data('stale');
    wire.exit(18);
    expect(output).not.toHaveBeenCalled();
    expect(exited).toHaveBeenCalledOnce();
  });

  it('authorizes explicit termination and clears every session mapping', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const stranger = { id: 'stranger' };
    const wires = [processWire(), processWire(), processWire()];
    const pending = [...wires];
    const terminate = vi.fn();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => pending.shift()!.process },
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'work', launch);
    registry.attach(creator, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    registry.grant(creator, 'work', recipient);
    registry.attach(recipient, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 });

    expect(registry.terminate(stranger, 'work')).toBe(false);
    expect(registry.terminate(recipient, 'work')).toBe(true);
    expect(terminate).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'work']);
    expect(registry.has('work')).toBe(false);
    expect(registry.focus(creator, 'work', 'left', 80, 24)).toBeUndefined();
    expect(registry.focus(recipient, 'work', 'right', 80, 24)).toBeUndefined();

    const replacement = { id: 'replacement' };
    registry.reserve(replacement, 'work', launch);
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'new-right', cols: 80, rows: 24 })).toBe(false);
    expect(registry.attach(replacement, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
  });

  it('keeps authorization session-scoped and terminates a creator reservation', () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const recipient = { id: 'recipient' };
    const wire = processWire();
    const terminate = vi.fn();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => wire.process },
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(first, 'one', { ...launch, terminate: { command: 'tmux', args: ['kill-session', '-t', 'one'] } });
    registry.reserve(second, 'two', { ...launch, terminate: { command: 'tmux', args: ['kill-session', '-t', 'two'] } });
    registry.attach(first, { sessionId: 'one', projectionId: 'left', cols: 80, rows: 24 });

    expect(registry.grant(first, 'two', recipient)).toBe(false);
    expect(registry.grant(first, 'one', recipient)).toBe(true);
    expect(registry.terminate(second, 'two')).toBe(true);
    expect(terminate).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'two']);
    expect(registry.grant(second, 'two', recipient)).toBe(false);
    expect(registry.focus(first, 'one', 'left', 80, 24)).toBe(1);
  });

  it('terminates one session without clearing another session or retaining its grant', () => {
    const creator = { id: 'creator' };
    const survivor = { id: 'survivor' };
    const recipient = { id: 'recipient' };
    const replacement = { id: 'replacement' };
    const pending = [processWire(), processWire()];
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'one', launch);
    registry.reserve(survivor, 'one-more', launch);
    registry.attach(survivor, { sessionId: 'one-more', projectionId: 'right', cols: 80, rows: 24 });
    registry.grant(creator, 'one', recipient);

    expect(registry.terminate(creator, 'one')).toBe(true);
    expect(registry.focus(survivor, 'one-more', 'right', 80, 24)).toBe(1);
    registry.reserve(replacement, 'one', launch);
    expect(registry.attach(recipient, { sessionId: 'one', projectionId: 'stale-grant', cols: 80, rows: 24 })).toBe(false);
    expect(registry.attach(replacement, { sessionId: 'one', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
  });

  it('removes released grants and creators and abandons clients without termination', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const wire = processWire();
    const terminate = vi.fn();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => wire.process },
      terminate,
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'work', launch);
    registry.grant(creator, 'work', recipient);
    registry.release(recipient);
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 })).toBe(false);
    registry.attach(creator, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    registry.release(creator);
    expect(registry.grant(creator, 'work', recipient)).toBe(false);

    registry.abandonAll();
    expect(wire.process.kill).toHaveBeenCalledOnce();
    expect(terminate).not.toHaveBeenCalled();
    expect(registry.has('work')).toBe(false);
    expect(registry.grant(creator, 'work', recipient)).toBe(false);

    const replacement = { id: 'replacement' };
    registry.reserve(replacement, 'work', launch);
    expect(registry.attach(creator, { sessionId: 'work', projectionId: 'stale', cols: 80, rows: 24 })).toBe(false);
    expect(registry.attach(replacement, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
  });

  it('abandons all owner, projection, and outstanding grant state', () => {
    const creator = { id: 'creator' };
    const attached = { id: 'attached' };
    const granted = { id: 'granted' };
    const replacement = { id: 'replacement' };
    const pending = [processWire(), processWire()];
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'work', launch);
    registry.grant(creator, 'work', attached);
    registry.attach(attached, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 });
    registry.grant(creator, 'work', granted);

    registry.abandonAll();
    expect(registry.grant(creator, 'work', granted)).toBe(false);
    expect(registry.grant(attached, 'work', granted)).toBe(false);
    registry.reserve(replacement, 'work', launch);
    expect(registry.attach(granted, { sessionId: 'work', projectionId: 'stale-grant', cols: 80, rows: 24 })).toBe(false);
    expect(registry.attach(replacement, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 })).toBe(true);
  });
});