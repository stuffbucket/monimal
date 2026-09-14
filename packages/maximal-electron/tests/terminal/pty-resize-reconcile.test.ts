import { describe, expect, it, vi } from 'vitest';

/**
 * "Copy into New Window" gives one real PTY two or more live viewers. Each
 * can ask for a different size, but there is exactly one process to resize,
 * so `pty.ts` reconciles their requests to one authoritative size and tells
 * every viewer what that settled size is over `pty:size`, so each one can
 * clamp its own terminal-emulator grid to match what the byte stream now
 * assumes.
 *
 * A viewer joining or leaving has no single "active" window to defer to, so
 * that case falls back to the smallest live viewer (the same rule tmux
 * applies to a shared session). A *live* viewer's own resize is different:
 * taking the smallest there would silently revert the very action the user
 * just took, so that viewer's own size wins instead, and every other viewer
 * is asked (best-effort, via `matchWindowToGrid`) to physically resize its
 * own window to match rather than being left with a clamped, cropped-looking
 * grid.
 *
 * This is the regression coverage for both halves of that reconciliation:
 * without it, either the window that did not just resize is left rendering
 * into a grid the PTY no longer agrees with, or the window that did resize
 * finds its own action silently undone.
 */

const state = vi.hoisted(() => ({
  hosts: new Map<unknown, {
    spawn: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
    mirror: ReturnType<typeof vi.fn>;
    transfer: ReturnType<typeof vi.fn>;
    terminateAll: ReturnType<typeof vi.fn>;
    sessions: Set<string>;
  }>(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => process.env['TMPDIR'] ?? '/tmp' },
}));

vi.mock('../../src/host/terminal-host.js', () => ({
  TerminalHost: class {
    private readonly sessions = new Set<string>();
    private readonly mirrors = new Map<string, Set<{ onData: (chunk: string) => void; onExit: (exitCode: number) => void }>>();
    readonly spawn = vi.fn((request: { id: string }) => { this.sessions.add(request.id); });
    readonly list = vi.fn(() => [...this.sessions].map((id) => ({ id })));
    readonly write = vi.fn();
    readonly resize = vi.fn();
    readonly acknowledge = vi.fn();
    readonly terminate = vi.fn();
    readonly terminateAll = vi.fn();
    readonly has = vi.fn((id: string) => this.sessions.has(id));
    readonly mirror = vi.fn((id: string, observer: { onData: (chunk: string) => void; onExit: (exitCode: number) => void }) => {
      if (!this.sessions.has(id)) return undefined;
      const observers = this.mirrors.get(id) ?? new Set();
      observers.add(observer);
      this.mirrors.set(id, observers);
      return () => observers.delete(observer);
    });
    readonly transfer = vi.fn((id: string, destination: { spawn: (request: unknown) => void; sessions: Set<string> }, request: { cols: number; rows: number }) => {
      if (!this.sessions.has(id)) return false;
      this.sessions.delete(id);
      (destination as unknown as { sessions: Set<string> }).sessions.add(id);
      this.resize(id, request.cols, request.rows);
      return true;
    });
    constructor() { state.hosts.set(this, this as never); }
  },
  TmuxProjectionOwners: class {
    readonly has = vi.fn(() => false);
    readonly reserve = vi.fn();
    readonly attach = vi.fn(() => true);
    readonly focus = vi.fn(() => undefined);
    readonly write = vi.fn(() => true);
    readonly resize = vi.fn(() => true);
    readonly detach = vi.fn(() => true);
    readonly grant = vi.fn(() => true);
    readonly release = vi.fn();
    readonly terminate = vi.fn(() => false);
    readonly abandonAll = vi.fn();
  },
}));

const pty = await import('../../src/main/native/pty.js');

/** A window stand-in with just what `pty.ts` needs from a `BrowserWindow`. */
function window() {
  return { once: vi.fn(), isDestroyed: () => false } as never;
}

function hostFor(): {
  spawn: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
  mirror: ReturnType<typeof vi.fn>;
  transfer: ReturnType<typeof vi.fn>;
} {
  // Every window gets its own `TerminalHost` instance from the `Owners`
  // factory the first time it is used; this returns the most recently
  // created one, which is that window's, since each test uses fresh windows.
  return [...state.hosts.values()].at(-1)!;
}

describe('shared-session resize reconciliation', () => {
  it('resizes a single-viewer session directly, exactly as before', () => {
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });
    const owner = window();
    pty.spawnPty(owner, { id: 'solo', cols: 80, rows: 24 });
    const host = hostFor();

    pty.resizePty(owner, 'solo', 100, 40);

    expect(host.resize).toHaveBeenLastCalledWith('solo', 100, 40);
    expect(sizes).not.toHaveBeenCalled();
  });

  it('clamps a spawn or resize request past 256x128, so a mis-measured container cannot request a runaway grid', () => {
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: vi.fn() });
    const owner = window();
    pty.spawnPty(owner, { id: 'clamp-spawn', cols: 9999, rows: 9999 });
    const host = hostFor();

    expect(host.spawn).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'clamp-spawn', cols: 256, rows: 128 }),
    );

    pty.resizePty(owner, 'clamp-spawn', 9999, 9999);
    expect(host.resize).toHaveBeenLastCalledWith('clamp-spawn', 256, 128);
  });

  it("lets a live viewer's own resize win, and asks the other viewer to match it", async () => {
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });
    const owner = window();
    pty.spawnPty(owner, { id: 'shared-min', cols: 100, rows: 40 });
    const ownerHost = hostFor();

    const recipient = window();
    expect(pty.copyPty(owner, recipient, { id: 'shared-min', cols: 100, rows: 40 })).toBe(true);
    // The mirror only actually attaches on its first spawn, as a real second
    // window's renderer would do once it mounts.
    pty.spawnPty(recipient, { id: 'shared-min', cols: 80, rows: 24 });

    // Joining has no single "active" window to defer to, so the newcomer's
    // smaller size is the safe starting point for both.
    expect(ownerHost.resize).toHaveBeenLastCalledWith('shared-min', 80, 24);
    expect(sizes).toHaveBeenCalledWith(owner, 'shared-min', 80, 24);
    expect(sizes).toHaveBeenCalledWith(recipient, 'shared-min', 80, 24);

    sizes.mockClear();
    ownerHost.resize.mockClear();

    // The owner actively resizing larger now wins outright: its own action
    // is never silently reverted back to the mirror's smaller size.
    // A live viewer's own resize is coalesced through a short debounce (see
    // `scheduleReconcile`), so this settles asynchronously rather than
    // synchronously within the `resizePty()` call itself.
    pty.resizePty(owner, 'shared-min', 120, 50);
    await vi.waitFor(() => { expect(ownerHost.resize).toHaveBeenLastCalledWith('shared-min', 120, 50); });
    expect(sizes).toHaveBeenCalledWith(owner, 'shared-min', 120, 50);
    expect(sizes).toHaveBeenCalledWith(recipient, 'shared-min', 120, 50);

    sizes.mockClear();
    ownerHost.resize.mockClear();

    // The mirror resizing next wins in turn, by the same rule.
    pty.resizePty(recipient, 'shared-min', 60, 20);
    await vi.waitFor(() => { expect(ownerHost.resize).toHaveBeenLastCalledWith('shared-min', 60, 20); });
    expect(sizes).toHaveBeenCalledWith(owner, 'shared-min', 60, 20);
    expect(sizes).toHaveBeenCalledWith(recipient, 'shared-min', 60, 20);
  });

  it('shares a new split with every viewer, including a copy made from a copy', () => {
    const panes = vi.fn();
    pty.configurePty({
      emit: vi.fn(),
      onExit: vi.fn(),
      onStatus: vi.fn(),
      onSize: vi.fn(),
      onPane: panes,
    });
    const owner = window();
    pty.spawnPty(owner, { id: 'shared-pane', cols: 80, rows: 24 });

    const firstCopy = window();
    expect(pty.copyPty(owner, firstCopy, { id: 'shared-pane', cols: 80, rows: 24 })).toBe(true);
    pty.spawnPty(firstCopy, { id: 'shared-pane', cols: 80, rows: 24 });

    const secondCopy = window();
    expect(pty.copyPty(firstCopy, secondCopy, { id: 'shared-pane', cols: 80, rows: 24 })).toBe(true);
    pty.spawnPty(secondCopy, { id: 'shared-pane', cols: 80, rows: 24 });

    const pane = {
      direction: 'right' as const,
      first: { sessionId: 'shared-pane' },
      second: { sessionId: 'shared-pane-split' },
    };
    pty.syncPtyPane(firstCopy, 'shared-pane', pane);
    expect(panes).not.toHaveBeenCalled();

    pty.spawnPty(firstCopy, { id: 'shared-pane-split', cols: 80, rows: 24 });
    const splitHost = hostFor();
    expect(panes).toHaveBeenCalledWith(owner, 'shared-pane', pane);
    expect(panes).toHaveBeenCalledWith(firstCopy, 'shared-pane', pane);
    expect(panes).toHaveBeenCalledWith(secondCopy, 'shared-pane', pane);

    pty.spawnPty(owner, { id: 'shared-pane-split', cols: 80, rows: 24 });
    pty.spawnPty(secondCopy, { id: 'shared-pane-split', cols: 80, rows: 24 });
    expect(splitHost.mirror).toHaveBeenCalledTimes(2);
  });

  it("best-effort resizes the other viewer's own window to match, using the requestor's own measured cell size", async () => {
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });

    // The requestor (the window whose live resize is authoritative) reports
    // its own container rect: 1200x800 for a 120x40 grid, so 10px/col and
    // 20px/row. Its own chrome is zero (content size equals its rect).
    const ownerExecuteJavaScriptInIsolatedWorld = vi.fn().mockResolvedValue({ width: 1200, height: 800 });
    const owner = {
      once: vi.fn(),
      isDestroyed: () => false,
      webContents: { executeJavaScriptInIsolatedWorld: ownerExecuteJavaScriptInIsolatedWorld },
      getContentSize: () => [1200, 800],
    } as never;
    pty.spawnPty(owner, { id: 'shared-match', cols: 80, rows: 24 });

    const recipientExecuteJavaScriptInIsolatedWorld = vi.fn().mockResolvedValue({ width: 800, height: 480 });
    const setContentSize = vi.fn();
    const recipient = {
      once: vi.fn(),
      isDestroyed: () => false,
      webContents: { executeJavaScriptInIsolatedWorld: recipientExecuteJavaScriptInIsolatedWorld },
      getContentSize: () => [820, 500],
      setContentSize,
    } as never;
    pty.copyPty(owner, recipient, { id: 'shared-match', cols: 80, rows: 24 });
    pty.spawnPty(recipient, { id: 'shared-match', cols: 80, rows: 24 });

    pty.resizePty(owner, 'shared-match', 120, 40);

    // The physical resize is fire-and-forget, behind an isolated-world
    // measurement round trip (not `executeJavaScript()`, which this app's
    // CSP would block) on both the requestor and the recipient.
    await vi.waitFor(() => { expect(setContentSize).toHaveBeenCalled(); });

    for (const call of [ownerExecuteJavaScriptInIsolatedWorld, recipientExecuteJavaScriptInIsolatedWorld]) {
      expect(call).toHaveBeenCalled();
      const [worldId, scripts] = call.mock.calls[0] as [number, Array<{ code: string }>];
      expect(typeof worldId).toBe('number');
      expect(scripts[0]?.code).toContain('shared-match');
    }
    // Recipient's own rect (800x480) implies its own chrome is
    // (820-800, 500-480) = (20, 20). Applying the requestor's cell size
    // (10px/col, 20px/row) to the target grid (120x40) plus that chrome
    // gives (1200+20, 800+20) = (1220, 820).
    expect(setContentSize).toHaveBeenCalledWith(1220, 820);
  });

  it("still resizes the other viewer's window when its own grid already matches the target", async () => {
    // Regression test: the synchronous `pty:size` clamp broadcast and the
    // async physical-resize measurement race, so the recipient's own grid
    // (and thus a cell size derived from *its own* rect ÷ its own grid) can
    // already equal the target by the time this measurement resolves. Using
    // the requestor's cell size instead of the recipient's own means that
    // race can no longer hide a real size mismatch.
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });

    const ownerExecuteJavaScriptInIsolatedWorld = vi.fn().mockResolvedValue({ width: 1200, height: 800 });
    const owner = {
      once: vi.fn(),
      isDestroyed: () => false,
      webContents: { executeJavaScriptInIsolatedWorld: ownerExecuteJavaScriptInIsolatedWorld },
      getContentSize: () => [1200, 800],
    } as never;
    pty.spawnPty(owner, { id: 'shared-race', cols: 80, rows: 24 });

    // The recipient's own container rect is still genuinely smaller (864x480
    // for a 120x40 grid -- 7.2px/col, 12px/row), even though its own grid,
    // read from a self-derived cell size, would look like it already matches.
    const recipientExecuteJavaScriptInIsolatedWorld = vi.fn().mockResolvedValue({ width: 864, height: 480 });
    const setContentSize = vi.fn();
    const recipient = {
      once: vi.fn(),
      isDestroyed: () => false,
      webContents: { executeJavaScriptInIsolatedWorld: recipientExecuteJavaScriptInIsolatedWorld },
      getContentSize: () => [880, 560],
      setContentSize,
    } as never;
    pty.copyPty(owner, recipient, { id: 'shared-race', cols: 80, rows: 24 });
    pty.spawnPty(recipient, { id: 'shared-race', cols: 80, rows: 24 });

    pty.resizePty(owner, 'shared-race', 120, 40);

    // Chrome is (880-864, 560-480) = (16, 80). Requestor's cell size is
    // 1200/120 = 10px/col, 800/40 = 20px/row. Target is
    // (120*10+16, 40*20+80) = (1216, 880), well past the recipient's
    // current (880, 560), so the resize must still happen.
    await vi.waitFor(() => { expect(setContentSize).toHaveBeenCalledWith(1216, 880); });
  });

  it('restores the remaining viewer to its own size once a mirror detaches', () => {
    const sizes = vi.fn();
    let closeMirror: (() => void) | undefined;
    const recipient = {
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'closed') closeMirror = handler;
      }),
      isDestroyed: () => false,
    } as never;
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });
    const owner = window();
    pty.spawnPty(owner, { id: 'shared-restore', cols: 100, rows: 40 });
    const ownerHost = hostFor();
    pty.copyPty(owner, recipient, { id: 'shared-restore', cols: 100, rows: 40 });
    pty.spawnPty(recipient, { id: 'shared-restore', cols: 60, rows: 20 });

    expect(ownerHost.resize).toHaveBeenLastCalledWith('shared-restore', 60, 20);
    ownerHost.resize.mockClear();
    sizes.mockClear();

    closeMirror?.();

    expect(ownerHost.resize).toHaveBeenLastCalledWith('shared-restore', 100, 40);
    expect(sizes).toHaveBeenCalledWith(owner, 'shared-restore', 100, 40);
  });

  it('reconciles against the recipient after a tab moves to a new window', () => {
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });
    const owner = window();
    pty.spawnPty(owner, { id: 'shared-move', cols: 100, rows: 40 });

    const recipient = window();
    pty.copyPty(owner, recipient, { id: 'shared-move', cols: 100, rows: 40 });
    pty.spawnPty(recipient, { id: 'shared-move', cols: 100, rows: 40 });

    const destination = window();
    expect(pty.transferPty(owner, destination, { id: 'shared-move', cols: 70, rows: 30 })).toBe(true);
    const destinationHost = hostFor();

    // Both the moved-to window and the surviving mirror should now be
    // reconciled to their smallest common size.
    expect(destinationHost.resize).toHaveBeenLastCalledWith('shared-move', 70, 30);
    expect(sizes).toHaveBeenCalledWith(destination, 'shared-move', 70, 30);
    expect(sizes).toHaveBeenCalledWith(recipient, 'shared-move', 70, 30);
  });
});
