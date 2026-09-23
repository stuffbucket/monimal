import { describe, expect, it, vi } from 'vitest';

import {
  TmuxProjectionOwners,
  type TerminalProcess,
  type TmuxProjectionOwnersOptions,
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
  ownership: 'created' as const,
  geometry: { transport: 'local' as const, sessionName: 'work' },
  terminate: { command: 'tmux', args: ['kill-session', '-t', 'work'] },
};

interface TestOwner {
  id: string;
}

const successfulCommand = async () => ({ stdout: 'latest\n' });

function projectionRegistry(
  wire: ReturnType<typeof processWire>,
  events: Partial<Pick<TmuxProjectionOwnersOptions<TestOwner>, 'emit' | 'onExit'>> = {},
): TmuxProjectionOwners<TestOwner> {
  return new TmuxProjectionOwners<TestOwner>({
    homeDirectory: '/home/ada',
    command: successfulCommand,
    connector: { connect: () => wire.process },
    terminate: vi.fn(),
    emit: events.emit ?? vi.fn(),
    onExit: events.onExit ?? vi.fn(),
  });
}

describe('projection ownership transitions', () => {
  function fixture() {
    const wires = [processWire(), processWire(), processWire()];
    const pending = [...wires];
    const output: string[] = [];
    const exits: number[] = [];
    const terminated: string[] = [];
    const registry = new TmuxProjectionOwners<{ id: string }>({
      homeDirectory: '/home/ada',
      command: successfulCommand,
      connector: { connect: () => pending.shift()!.process },
      terminate: (command) => { terminated.push(command); },
      emit: (owner, _sessionId, _projectionId, chunk) => { output.push(`${owner.id}:${chunk}`); },
      onExit: (_owner, _sessionId, _projectionId, code) => { exits.push(code); },
    });
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    registry.reserve(creator, 'work', launch);
    const request = { sessionId: 'work', projectionId: 'creator-view', cols: 80, rows: 24 };
    expect(registry.attach(creator, request)).toBe(true);
    return { registry, wires, output, exits, terminated, creator, recipient, request };
  }

  it('reattaches the same projection after renderer replacement and resumes input/output', () => {
    const { registry, wires, creator, request, output } = fixture();
    expect(registry.attach(creator, request)).toBe(true);
    const epoch = registry.focus(creator, 'work', request.projectionId, 80, 24)!;
    expect(registry.write(creator, 'work', request.projectionId, epoch, 'pwd\n')).toBe(true);
    wires[0]!.data('/home/ada\n');
    expect(output).toEqual(['creator:/home/ada\n']);
  });

  it('preserves a surviving copied view authority after its original window closes', () => {
    const { registry, creator, recipient, terminated } = fixture();
    expect(registry.grant(creator, 'work', recipient)).toBe(true);
    expect(registry.attach(recipient, {
      sessionId: 'work', projectionId: 'recipient-view', cols: 80, rows: 24,
    })).toBe(true);
    registry.release(creator);
    expect(registry.has('work')).toBe(true);
    const epoch = registry.focus(recipient, 'work', 'recipient-view', 80, 24)!;
    expect(registry.write(recipient, 'work', 'recipient-view', epoch, 'exit\n')).toBe(true);
    expect(registry.terminate(recipient, 'work')).toBe(true);
    expect(terminated).toEqual(['tmux']);
    expect(registry.has('work')).toBe(false);
  });

  it('allows a copied view to open another view without granting authority to strangers', () => {
    const { registry, creator, recipient } = fixture();
    const destination = { id: 'destination' };
    expect(registry.grant({ id: 'stranger' }, 'work', destination)).toBe(false);
    expect(registry.grant(creator, 'work', recipient)).toBe(true);
    expect(registry.attach(recipient, {
      sessionId: 'work', projectionId: 'recipient-view', cols: 80, rows: 24,
    })).toBe(true);
    expect(registry.grant(recipient, 'work', destination)).toBe(true);
    expect(registry.attach(destination, {
      sessionId: 'work', projectionId: 'destination-view', cols: 80, rows: 24,
    })).toBe(true);
    const epoch = registry.focus(destination, 'work', 'destination-view', 80, 24)!;
    expect(registry.write(destination, 'work', 'destination-view', epoch, 'pwd\n')).toBe(true);
  });

  it('keeps a durable session alive after its last view detaches and can reattach', () => {
    const { registry, creator, request, terminated, output, wires } = fixture();
    expect(registry.detach(creator, 'work', request.projectionId)).toBe(true);
    expect(registry.has('work')).toBe(true);
    expect(terminated).toEqual([]);
    expect(registry.attach(creator, request)).toBe(true);
    wires[1]!.data('reattached');
    expect(output).toEqual(['creator:reattached']);
  });

  it('ignores late process events after window release without killing the durable session', () => {
    const { registry, creator, wires, output, exits, terminated } = fixture();
    registry.release(creator);
    wires[0]!.data('late');
    wires[0]!.exit(9);
    expect(output).toEqual([]);
    expect(exits).toEqual([]);
    expect(terminated).toEqual([]);
    expect(registry.has('work')).toBe(true);
  });
});

describe('TmuxProjectionOwners', () => {
  it('lists a durable projection and accepts its existing identity after renderer reload', () => {
    const owner = { id: 'window' };
    const wire = processWire();
    const registry = projectionRegistry(wire);
    registry.reserve(owner, 'work', launch);

    expect(registry.attach(owner, {
      sessionId: 'work',
      projectionId: 'work:window',
      cols: 80,
      rows: 24,
    })).toBe(true);
    expect(registry.list(owner)).toEqual(['work']);
    expect(registry.attach(owner, {
      sessionId: 'work',
      projectionId: 'work:window',
      cols: 100,
      rows: 30,
    })).toBe(true);
    expect(wire.process.resize).not.toHaveBeenCalled();
    expect(registry.focus(owner, 'work', 'work:window', 100, 30)).toBe(1);
  });

  it('reports server-confirmed geometry and rejected geometry to every attached owner', async () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const pending = [processWire(), processWire()];
    const geometry = vi.fn();
    const geometryError = vi.fn();
    const command = vi.fn()
      .mockResolvedValueOnce({ stdout: 'latest\n' })
      .mockResolvedValueOnce({ stdout: '101x31\n' })
      .mockRejectedValueOnce(new Error('remote resize refused'));
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command,
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
      onGeometry: geometry,
      onGeometryError: geometryError,
    });
    registry.reserve(first, 'work', launch);
    registry.attach(first, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });
    registry.grant(first, 'work', second);
    registry.attach(second, { sessionId: 'work', projectionId: 'right', cols: 80, rows: 24 });

    const firstEpoch = registry.focus(first, 'work', 'left', 100, 30)!;
    await vi.waitFor(() => expect(geometry).toHaveBeenCalledTimes(2));
    expect(geometry.mock.calls).toEqual([
      [first, 'work', 'left', 101, 31],
      [second, 'work', 'right', 101, 31],
    ]);

    registry.resize(first, 'work', 'left', firstEpoch, 120, 40);
    await vi.waitFor(() => expect(geometryError).toHaveBeenCalledTimes(2));
    expect(geometryError.mock.calls).toEqual([
      [first, 'work', 'left', expect.objectContaining({ message: 'remote resize refused' })],
      [second, 'work', 'right', expect.objectContaining({ message: 'remote resize refused' })],
    ]);
  });

  it('fans one session out to N isolated owners and releases only one owner', () => {
    const owners = Array.from({ length: 4 }, (_, index) => ({ id: `window-${String(index)}` }));
    const wires = owners.map(() => processWire());
    const pending = [...wires];
    const output: string[] = [];
    const registry = new TmuxProjectionOwners<{ id: string }>({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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
    const registry = new TmuxProjectionOwners<{ id: string }>({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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

  it('lets the session owner revoke a pending copy grant', () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const wires = [processWire()];
    const pending = [...wires];
    const registry = new TmuxProjectionOwners<TestOwner>({
      homeDirectory: '/home/ada',
      command: successfulCommand,
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(first, 'work', launch);
    registry.attach(first, { sessionId: 'work', projectionId: 'first', cols: 80, rows: 24 });
    registry.grant(first, 'work', second);

    expect(registry.revoke(first, 'work', second)).toBe(true);
    expect(registry.attach(second, {
      sessionId: 'work',
      projectionId: 'second',
      cols: 80,
      rows: 24,
    })).toBe(false);
  });

  it('lets an active secondary projection grant a move destination', () => {
    const authority = { id: 'authority' };
    const secondary = { id: 'secondary' };
    const destination = { id: 'destination' };
    const wires = [processWire(), processWire(), processWire()];
    const pending = [...wires];
    const registry = new TmuxProjectionOwners<TestOwner>({
      homeDirectory: '/home/ada',
      command: successfulCommand,
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(authority, 'work', launch);
    registry.attach(authority, {
      sessionId: 'work',
      projectionId: 'authority',
      cols: 80,
      rows: 24,
    });
    registry.grant(authority, 'work', secondary);
    registry.attach(secondary, {
      sessionId: 'work',
      projectionId: 'secondary',
      cols: 80,
      rows: 24,
    });

    expect(registry.grant(secondary, 'work', destination)).toBe(true);
    expect(registry.revoke(secondary, 'work', destination)).toBe(true);
    expect(registry.attach(destination, {
      sessionId: 'work',
      projectionId: 'revoked',
      cols: 80,
      rows: 24,
    })).toBe(false);
    expect(registry.grant(secondary, 'work', destination)).toBe(true);
    expect(registry.attach(destination, {
      sessionId: 'work',
      projectionId: 'destination',
      cols: 80,
      rows: 24,
    })).toBe(true);
  });

  it('detaches only a transaction-created destination projection on rollback', () => {
    const source = { id: 'source' };
    const destination = { id: 'destination' };
    const wires = [processWire(), processWire(), processWire()];
    const pending = [...wires];
    const registry = new TmuxProjectionOwners<TestOwner>({
      homeDirectory: '/home/ada',
      command: successfulCommand,
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(source, 'work', launch);
    registry.attach(source, {
      sessionId: 'work',
      projectionId: 'source',
      cols: 80,
      rows: 24,
    });
    registry.grant(source, 'work', destination);
    registry.attach(destination, {
      sessionId: 'work',
      projectionId: 'existing',
      cols: 80,
      rows: 24,
    });
    const before = new Set(registry.projectionIds(destination, 'work'));
    registry.grant(source, 'work', destination);
    registry.attach(destination, {
      sessionId: 'work',
      projectionId: 'transaction-created',
      cols: 80,
      rows: 24,
    });

    for (const projectionId of registry.projectionIds(destination, 'work')) {
      if (!before.has(projectionId)) registry.detach(destination, 'work', projectionId);
    }
    registry.revoke(source, 'work', destination);

    expect(registry.projectionIds(destination, 'work')).toEqual(['existing']);
    expect(registry.focus(destination, 'work', 'existing', 80, 24)).toBe(1);
    expect(wires[1]?.process.kill).not.toHaveBeenCalled();
    expect(wires[2]?.process.kill).toHaveBeenCalledOnce();
  });

  it('keeps original projection views usable after a partial staged grant rolls back', () => {
    const source = { id: 'source' };
    const destination = { id: 'destination' };
    const wires = [processWire(), processWire(), processWire()];
    const pending = [...wires];
    const registry = new TmuxProjectionOwners<TestOwner>({
      homeDirectory: '/home/ada',
      command: successfulCommand,
      connector: { connect: () => pending.shift()!.process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(source, 'first', launch);
    registry.reserve(source, 'second', launch);
    registry.attach(source, {
      sessionId: 'first',
      projectionId: 'first:source',
      cols: 80,
      rows: 24,
    });
    registry.attach(source, {
      sessionId: 'second',
      projectionId: 'second:source',
      cols: 80,
      rows: 24,
    });

    expect(registry.grant(source, 'first', destination)).toBe(true);
    expect(registry.attach(destination, {
      sessionId: 'first',
      projectionId: 'first:destination',
      cols: 80,
      rows: 24,
    })).toBe(true);
    expect(registry.grant(source, 'missing', destination)).toBe(false);

    expect(registry.detachOwner(destination, 'first')).toBe(true);
    registry.revoke(source, 'first', destination);
    const firstEpoch = registry.focus(source, 'first', 'first:source', 80, 24)!;
    const secondEpoch = registry.focus(source, 'second', 'second:source', 80, 24)!;
    expect(registry.write(source, 'first', 'first:source', firstEpoch, 'source-first')).toBe(true);
    expect(registry.write(source, 'second', 'second:source', secondEpoch, 'source-second')).toBe(true);
    expect(wires[0]?.process.write).toHaveBeenCalledWith('source-first');
    expect(wires[1]?.process.write).toHaveBeenCalledWith('source-second');
    expect(wires[2]?.process.kill).toHaveBeenCalledOnce();
  });

  it('drops projection events after their owner mapping has been released', () => {
    const owner = { id: 'owner' };
    const wire = processWire();
    const events = { emit: vi.fn(), onExit: vi.fn() };
    const registry = projectionRegistry(wire, events);
    registry.reserve(owner, 'work', launch);
    registry.attach(owner, { sessionId: 'work', projectionId: 'view', cols: 80, rows: 24 });

    const state = registry as unknown as {
      projectionOwners: Map<string, { id: string }>;
    };
    state.projectionOwners.clear();

    expect(() => wire.data('late output')).not.toThrow();
    expect(() => wire.exit(0)).not.toThrow();
    expect(events.emit).not.toHaveBeenCalled();
    expect(events.onExit).not.toHaveBeenCalled();
  });

  it('forwards controls only for the current projection owner and epoch', () => {
    const owner = { id: 'owner' };
    const stranger = { id: 'stranger' };
    const wire = processWire();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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

  it('requires active control and lets an attached owner delegate', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const delegate = { id: 'delegate' };
    const stranger = { id: 'stranger' };
    const pending = [processWire(), processWire(), processWire()];
    const connect = vi.fn(() => pending.shift()!.process);
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'recipient', cols: 100, rows: 30 })).toBe(true);
    expect(registry.attach(recipient, { sessionId: 'work', projectionId: 'second', cols: 80, rows: 24 })).toBe(false);
    expect(registry.grant(recipient, 'work', delegate)).toBe(true);
    expect(registry.attach(delegate, { sessionId: 'work', projectionId: 'delegate', cols: 80, rows: 24 })).toBe(true);
    expect(registry.grant(stranger, 'work', delegate)).toBe(false);
    expect(registry.attach(creator, { sessionId: 'work', projectionId: 'creator', cols: 80, rows: 24 })).toBe(true);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(registry.focus(creator, 'work', 'creator', 80, 24)).toBe(1);
  });

  it('rolls ownership back when a connector throws and consumes the one-time grant', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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
      command: async () => ({ stdout: 'latest\n' }),
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

  it('lets an attached projection terminate the session and clears every mapping', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const stranger = { id: 'stranger' };
    const wires = [processWire(), processWire(), processWire()];
    const pending = [...wires];
    const terminate = vi.fn();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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

  it('moves session authority before the destination projection attaches', () => {
    const creator = { id: 'creator' };
    const recipient = { id: 'recipient' };
    const delegate = { id: 'delegate' };
    const stranger = { id: 'stranger' };
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
      connector: { connect: () => processWire().process },
      terminate: vi.fn(),
      emit: vi.fn(),
      onExit: vi.fn(),
    });
    registry.reserve(creator, 'work', launch);
    registry.attach(creator, { sessionId: 'work', projectionId: 'left', cols: 80, rows: 24 });

    expect(registry.transfer(creator, 'work', recipient)).toBe(true);
    expect(registry.grant(creator, 'work', delegate)).toBe(true);
    expect(registry.grant(stranger, 'work', delegate)).toBe(false);
    expect(registry.attach(recipient, {
      sessionId: 'work',
      projectionId: 'right',
      cols: 80,
      rows: 24,
    })).toBe(true);
    expect(registry.terminate(recipient, 'work')).toBe(true);
  });

  it('keeps authorization session-scoped and terminates a creator reservation', () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const recipient = { id: 'recipient' };
    const wire = processWire();
    const terminate = vi.fn();
    const registry = new TmuxProjectionOwners({
      homeDirectory: '/home/ada',
      command: async () => ({ stdout: 'latest\n' }),
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
      command: async () => ({ stdout: 'latest\n' }),
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
      command: async () => ({ stdout: 'latest\n' }),
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
      command: async () => ({ stdout: 'latest\n' }),
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