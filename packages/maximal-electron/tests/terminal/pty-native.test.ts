import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hosts: [] as Array<{
    spawn: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    acknowledge: ReturnType<typeof vi.fn>;
  }>,
  throwOnSpawn: false,
  projectionHosts: [] as Array<{
    reserve: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    abandonAll: ReturnType<typeof vi.fn>;
    sessions: Set<string>;
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
    constructor(options: { emit: (id: string, chunk: string, sequence?: number) => void }) {
      state.hosts.push(this);
      options.emit('session', 'output', 7);
    }
  },
  TmuxProjectionHost: class {
    readonly sessions = new Set<string>();
    readonly reserve = vi.fn((id: string) => this.sessions.add(id));
    readonly has = vi.fn((id: string) => this.sessions.has(id));
    readonly attach = vi.fn(() => true);
    readonly focus = vi.fn(() => 1);
    readonly write = vi.fn(() => true);
    readonly resize = vi.fn(() => true);
    readonly terminate = vi.fn((id: string) => this.sessions.delete(id));
    readonly abandonAll = vi.fn(() => this.sessions.clear());
    constructor() { state.projectionHosts.push(this); }
  },
}));

const pty = await import('../../src/main/native/pty.js');

function owner() {
  return { once: vi.fn() } as never;
}

describe('native pty adapter', () => {
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
});