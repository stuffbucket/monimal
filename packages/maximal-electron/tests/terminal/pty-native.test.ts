import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hosts: [] as Array<{
    spawn: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    acknowledge: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
  }>,
  throwOnSpawn: false,
  failedProjectionGrants: new Set<string>(),
  failedProjectionTransfers: new Set<string>(),
  projectionHosts: [] as Array<{
    reserve: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    detachOwner: ReturnType<typeof vi.fn>;
    grant: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    transfer: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    abandonAll: ReturnType<typeof vi.fn>;
    sessions: Set<string>;
    owners: Map<string, unknown>;
    grants: Map<string, Set<unknown>>;
  }>,
}));

vi.mock('electron', () => ({
  app: { getPath: () => process.env['TMPDIR'] ?? '/tmp' },
}));

vi.mock('../../src/host/terminal-host.js', () => ({
  TerminalHost: class {
    private readonly sessions = new Set<string>();
    readonly spawn = vi.fn((request: { id: string }) => {
      if (state.throwOnSpawn) throw new Error('connector failed');
      this.sessions.add(request.id);
    });
    readonly list = vi.fn(() => [...this.sessions].map((id) => ({ id })));
    readonly write = vi.fn();
    readonly resize = vi.fn();
    readonly acknowledge = vi.fn();
    readonly terminate = vi.fn();
    readonly terminateAll = vi.fn();
    readonly has = vi.fn((id: string) => this.sessions.has(id));
    readonly transfer = vi.fn((id: string, destination: { sessions: Set<string> }) => {
      if (!this.sessions.has(id) || destination.sessions.has(id)) return false;
      this.sessions.delete(id);
      destination.sessions.add(id);
      return true;
    });
    constructor(options: { emit: (id: string, chunk: string, sequence?: number) => void }) {
      state.hosts.push(this);
      options.emit('session', 'output', 7);
    }
  },
  TmuxProjectionOwners: class {
    readonly sessions = new Set<string>();
    readonly owners = new Map<string, unknown>();
    readonly grants = new Map<string, Set<unknown>>();
    readonly reserve = vi.fn((owner: unknown, id: string) => {
      this.sessions.add(id);
      this.owners.set(id, owner);
    });
    readonly has = vi.fn((id: string) => this.sessions.has(id));
    readonly attach = vi.fn(() => true);
    readonly focus = vi.fn(() => 1);
    readonly write = vi.fn(() => true);
    readonly resize = vi.fn(() => true);
    readonly detach = vi.fn(() => true);
    readonly detachOwner = vi.fn(() => true);
    readonly grant = vi.fn((owner: unknown, id: string, recipient: unknown) => {
      if (state.failedProjectionGrants.has(id) || this.owners.get(id) !== owner) return false;
      const recipients = this.grants.get(id) ?? new Set();
      recipients.add(recipient);
      this.grants.set(id, recipients);
      return true;
    });
    readonly revoke = vi.fn((owner: unknown, id: string, recipient: unknown) => {
      if (this.owners.get(id) !== owner) return false;
      return this.grants.get(id)?.delete(recipient) ?? false;
    });
    readonly transfer = vi.fn((owner: unknown, id: string, recipient: unknown) => {
      if (state.failedProjectionTransfers.has(id) || this.owners.get(id) !== owner) return false;
      this.owners.set(id, recipient);
      return true;
    });
    readonly release = vi.fn();
    readonly terminate = vi.fn((_owner: unknown, id: string) => this.sessions.delete(id));
    readonly abandonAll = vi.fn(() => this.sessions.clear());
    constructor() { state.projectionHosts.push(this); }
  },
}));

const pty = await import('../../src/main/native/pty.js');

let nextOwnerId = 1;
function owner() {
  return {
    id: nextOwnerId++,
    once: vi.fn(),
    isDestroyed: () => false,
    isResizable: () => true,
    getContentSize: () => [800, 600],
    setContentSize: vi.fn(),
  } as never;
}

describe('native pty adapter', () => {
  beforeEach(() => {
    state.failedProjectionGrants.clear();
    state.failedProjectionTransfers.clear();
  });

  it('forwards the host output sequence to the owner event adapter', () => {
    const emit = vi.fn();
    const window = owner();
    pty.configurePty({ emit, onExit: vi.fn(), onStatus: vi.fn() });

    expect(() => pty.spawnReservedPty(owner(), { id: 'unreserved', cols: 80, rows: 24 })).toThrow('not reserved');
    pty.launchTerminal(window, { profileId: 'local', cols: 80, rows: 24 });
    pty.acknowledgePty(window, 'session', 7);

    expect(emit).toHaveBeenCalledWith(expect.anything(), 'session', 'output', 7);
    expect(state.hosts.at(-1)?.acknowledge).toHaveBeenCalledWith('session', 7);
  });

  it('opens an unreserved session for a trusted embedder', () => {
    const window = owner();

    expect(() => pty.spawnPty(window, { id: 'embedder-session', cols: 80, rows: 24 })).not.toThrow();
    expect(state.hosts.at(-1)?.spawn).toHaveBeenLastCalledWith({
      id: 'embedder-session',
      cols: 80,
      rows: 24,
    });
  });

  it('attaches a view to a session launched for the same owner', () => {
    const window = owner();
    const result = pty.launchTerminal(window, { profileId: 'local', cols: 80, rows: 24 });
    const host = state.hosts.at(-1)!;

    expect(() => {
      pty.spawnPty(window, { id: result.sessionId, cols: 100, rows: 40 });
    }).not.toThrow();
    expect(host.spawn).toHaveBeenLastCalledWith({
      id: result.sessionId,
      cols: 100,
      rows: 40,
    });
  });

  it('does not report a launch when the trusted connector throws synchronously', () => {
    state.throwOnSpawn = true;
    const window = owner();

    expect(() => pty.launchTerminal(window, { profileId: 'local', cols: 80, rows: 24 })).toThrow('connector failed');
    expect(() => pty.spawnReservedPty(window, { id: 'unknown', cols: 80, rows: 24 })).toThrow('not reserved');

    state.throwOnSpawn = false;
  });

  it('moves mixed direct and projection-backed sessions as one ownership unit', () => {
    const source = owner();
    const destination = owner();
    pty.spawnPty(source, { id: 'mixed-direct', cols: 80, rows: 24 });
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('mixed-projection');
    projections.owners.set('mixed-projection', source);

    expect(pty.transferPtyOwnership(source, destination, [
      { id: 'mixed-direct', cols: 100, rows: 30 },
      { id: 'mixed-projection', cols: 100, rows: 30 },
    ])).toBe(true);

    expect(projections.owners.get('mixed-projection')).toBe(destination);
    expect(projections.grants.get('mixed-projection')?.has(destination)).toBe(false);
    expect(projections.detachOwner).toHaveBeenCalledWith(
      source,
      'mixed-projection',
    );
    expect(pty.transferPty(source, owner(), {
      id: 'mixed-direct',
      cols: 80,
      rows: 24,
    })).toBe(false);
    expect(pty.transferPty(destination, owner(), {
      id: 'mixed-direct',
      cols: 80,
      rows: 24,
    })).toBe(true);
  });

  it('rejects duplicate session IDs before staging any ownership', () => {
    const source = owner();
    const destination = owner();
    pty.spawnPty(source, { id: 'duplicate', cols: 80, rows: 24 });

    expect(pty.stagePtyOwnership(source, destination, [
      { id: 'duplicate', cols: 80, rows: 24 },
      { id: 'duplicate', cols: 100, rows: 30 },
    ], 'move')).toBeUndefined();
    expect(pty.transferPty(source, owner(), {
      id: 'duplicate',
      cols: 80,
      rows: 24,
    })).toBe(true);
  });

  it('removes staged destination capabilities without moving the source', () => {
    const source = owner();
    const destination = owner();
    pty.spawnPty(source, { id: 'staged-direct', cols: 80, rows: 24 });
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('staged-projection-view');
    projections.owners.set('staged-projection-view', source);

    const transaction = pty.stagePtyOwnership(source, destination, [
      { id: 'staged-direct', cols: 80, rows: 24 },
      { id: 'staged-projection-view', cols: 80, rows: 24 },
    ], 'move');
    expect(transaction).toBeDefined();

    transaction?.rollback();

    expect(projections.owners.get('staged-projection-view')).toBe(source);
    expect(projections.revoke).toHaveBeenCalledWith(
      source,
      'staged-projection-view',
      destination,
    );
    expect(pty.transferPty(destination, owner(), {
      id: 'staged-direct',
      cols: 80,
      rows: 24,
    })).toBe(false);
    expect(pty.transferPty(source, owner(), {
      id: 'staged-direct',
      cols: 80,
      rows: 24,
    })).toBe(true);
  });

  it('rolls back an earlier direct move when a later projection move fails', () => {
    const source = owner();
    const destination = owner();
    pty.spawnPty(source, { id: 'rollback-direct', cols: 80, rows: 24 });
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('rollback-projection');
    projections.owners.set('rollback-projection', source);
    state.failedProjectionTransfers.add('rollback-projection');

    expect(pty.transferPtyOwnership(source, destination, [
      { id: 'rollback-direct', cols: 100, rows: 30 },
      { id: 'rollback-projection', cols: 100, rows: 30 },
    ])).toBe(false);

    expect(projections.owners.get('rollback-projection')).toBe(source);
    expect(projections.detachOwner).not.toHaveBeenCalledWith(
      source,
      'rollback-projection',
    );
    expect(pty.transferPty(source, owner(), {
      id: 'rollback-direct',
      cols: 80,
      rows: 24,
    })).toBe(true);
  });

  it('restores staged projection authority when a later direct move fails', () => {
    const source = owner();
    const destination = owner();
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('staged-projection');
    projections.owners.set('staged-projection', source);

    expect(pty.transferPtyOwnership(source, destination, [
      { id: 'staged-projection', cols: 100, rows: 30 },
      { id: 'missing-direct-move', cols: 100, rows: 30 },
    ])).toBe(false);

    expect(projections.owners.get('staged-projection')).toBe(source);
    expect(projections.detachOwner).not.toHaveBeenCalledWith(
      source,
      'staged-projection',
    );
  });

  it('copies mixed direct and projection-backed sessions as one ownership unit', () => {
    const source = owner();
    const destination = owner();
    pty.spawnPty(source, { id: 'copy-direct', cols: 80, rows: 24 });
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('copy-success-projection');
    projections.owners.set('copy-success-projection', source);

    expect(pty.copyPtyOwnership(source, destination, [
      { id: 'copy-direct', cols: 80, rows: 24 },
      { id: 'copy-success-projection', cols: 80, rows: 24 },
    ])).toBe(true);

    expect(projections.grants.get('copy-success-projection')?.has(destination)).toBe(true);
    expect(pty.transferPty(destination, owner(), {
      id: 'copy-direct',
      cols: 80,
      rows: 24,
    })).toBe(true);
  });

  it('removes an earlier direct mirror when a later projection grant fails', () => {
    const source = owner();
    const destination = owner();
    pty.spawnPty(source, { id: 'copy-rollback-direct', cols: 80, rows: 24 });
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('copy-failing-projection');
    projections.owners.set('copy-failing-projection', source);
    state.failedProjectionGrants.add('copy-failing-projection');

    expect(pty.copyPtyOwnership(source, destination, [
      { id: 'copy-rollback-direct', cols: 80, rows: 24 },
      { id: 'copy-failing-projection', cols: 80, rows: 24 },
    ])).toBe(false);

    expect(pty.transferPty(destination, owner(), {
      id: 'copy-rollback-direct',
      cols: 80,
      rows: 24,
    })).toBe(false);
  });

  it('revokes mixed copy capabilities when any session cannot be copied', () => {
    const source = owner();
    const destination = owner();
    const projections = state.projectionHosts[0]!;
    projections.sessions.add('copy-projection');
    projections.owners.set('copy-projection', source);

    expect(pty.copyPtyOwnership(source, destination, [
      { id: 'copy-projection', cols: 80, rows: 24 },
      { id: 'missing-direct', cols: 80, rows: 24 },
    ])).toBe(false);

    expect(projections.revoke).toHaveBeenCalledWith(source, 'copy-projection', destination);
    expect(projections.grants.get('copy-projection')?.has(destination)).toBe(false);
  });
});