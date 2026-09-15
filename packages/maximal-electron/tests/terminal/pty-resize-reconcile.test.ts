import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

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
    write: ReturnType<typeof vi.fn>;
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
let nextWindowId = 1;
type TestWindow = BrowserWindow & { setContentSize: ReturnType<typeof vi.fn> };
function window(width = 800, height = 600): TestWindow {
  let size = [width, height];
  return {
    id: nextWindowId++,
    once: vi.fn(),
    isDestroyed: () => false,
    isResizable: () => true,
    getContentSize: () => size,
    setContentSize: vi.fn((nextWidth: number, nextHeight: number) => {
      size = [nextWidth, nextHeight];
    }),
  } as unknown as TestWindow;
}

function hostFor(): {
  spawn: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
  mirror: ReturnType<typeof vi.fn>;
  transfer: ReturnType<typeof vi.fn>;
  terminateAll: ReturnType<typeof vi.fn>;
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

  it('keeps original and copied viewers as flat siblings of the canonical owner', () => {
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
    const unauthorized = window();
    expect(() => pty.spawnPty(unauthorized, {
      id: 'shared-pane',
      cols: 80,
      rows: 24,
    })).toThrow('not authorized');

    const firstCopy = window();
    expect(pty.copyPty(owner, firstCopy, { id: 'shared-pane', cols: 80, rows: 24 })).toBe(true);
    pty.spawnPty(firstCopy, { id: 'shared-pane', cols: 80, rows: 24 });

    const secondCopy = window();
    expect(pty.copyPty(owner, secondCopy, { id: 'shared-pane', cols: 80, rows: 24 })).toBe(true);
    pty.spawnPty(secondCopy, { id: 'shared-pane', cols: 80, rows: 24 });

    const copiedViaSibling = window();
    expect(pty.copyPty(firstCopy, copiedViaSibling, {
      id: 'shared-pane',
      cols: 80,
      rows: 24,
    })).toBe(true);
    pty.spawnPty(copiedViaSibling, { id: 'shared-pane', cols: 80, rows: 24 });

    const pane = {
      direction: 'right' as const,
      first: { sessionId: 'shared-pane' },
      second: { sessionId: 'shared-pane-split' },
    };
    pty.syncPtyPane(firstCopy, 'shared-pane', pane);
    expect(panes).not.toHaveBeenCalled();

    pty.spawnPty(firstCopy, { id: 'shared-pane-split', cols: 80, rows: 24 });
    const splitHost = hostFor();
    expect(panes).toHaveBeenCalledWith(owner, 'shared-pane', pane, 1, String(firstCopy.id));
    expect(panes).toHaveBeenCalledWith(firstCopy, 'shared-pane', pane, 1, String(firstCopy.id));
    expect(panes).toHaveBeenCalledWith(secondCopy, 'shared-pane', pane, 1, String(firstCopy.id));
    expect(panes).toHaveBeenCalledWith(
      copiedViaSibling,
      'shared-pane',
      pane,
      1,
      String(firstCopy.id),
    );

    pty.spawnPty(owner, { id: 'shared-pane-split', cols: 80, rows: 24 });
    pty.spawnPty(secondCopy, { id: 'shared-pane-split', cols: 80, rows: 24 });
    pty.spawnPty(copiedViaSibling, { id: 'shared-pane-split', cols: 80, rows: 24 });
    expect(splitHost.mirror).toHaveBeenCalledTimes(3);

    const rootHost = [...state.hosts.values()].at(-2)!;
    for (const viewer of [owner, firstCopy, secondCopy, copiedViaSibling]) {
      pty.writePty(viewer, 'shared-pane', 'root-input');
      pty.writePty(viewer, 'shared-pane-split', 'split-input');
    }
    expect(rootHost.write).toHaveBeenCalledTimes(4);
    expect(splitHost.write).toHaveBeenCalledTimes(4);

    const closeHooks = (firstCopy.once as unknown as ReturnType<typeof vi.fn>).mock.calls as
      Array<[event: string, listener: () => void]>;
    const closeFirstCopy = closeHooks.find(([event]) => event === 'closed')?.[1];
    expect(closeFirstCopy).toBeTypeOf('function');
    closeFirstCopy?.();
    pty.writePty(copiedViaSibling, 'shared-pane', 'after-sibling-close');
    expect(rootHost.write).toHaveBeenLastCalledWith('shared-pane', 'after-sibling-close');
  });

  it("synchronizes the other viewer's whole physical window without measuring a split leaf", () => {
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });
    const owner = window(1200, 800);
    pty.spawnPty(owner, { id: 'shared-match', cols: 80, rows: 24 });

    const recipient = window(820, 500);
    pty.copyPty(owner, recipient, { id: 'shared-match', cols: 80, rows: 24 });
    pty.spawnPty(recipient, { id: 'shared-match', cols: 80, rows: 24 });

    pty.resizePty(owner, 'shared-match', 120, 40);

    expect(recipient.setContentSize).toHaveBeenCalledWith(1200, 800);
  });

  it("still reconciles physical windows when the canonical grid is unchanged", () => {
    const sizes = vi.fn();
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: sizes });
    const owner = window(1200, 800);
    pty.spawnPty(owner, { id: 'shared-race', cols: 80, rows: 24 });

    const recipient = window(880, 560);
    pty.copyPty(owner, recipient, { id: 'shared-race', cols: 80, rows: 24 });
    pty.spawnPty(recipient, { id: 'shared-race', cols: 80, rows: 24 });

    pty.resizePty(owner, 'shared-race', 80, 24);
    expect(recipient.setContentSize).toHaveBeenCalledWith(1200, 800);
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

  it('promotes the oldest copy and keeps sibling-origin copies flat after promotion', () => {
    let closeOwner: (() => void) | undefined;
    const owner = {
      ...window(),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'closed') closeOwner = callback;
      }),
    } as unknown as TestWindow;
    pty.configurePty({ emit: vi.fn(), onExit: vi.fn(), onStatus: vi.fn(), onSize: vi.fn() });
    pty.spawnPty(owner, { id: 'shared-owner-close', cols: 80, rows: 24 });
    const sourceHost = hostFor();
    const firstCopyCloseHandlers: Array<() => void> = [];
    const firstCopy = {
      ...window(),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'closed') firstCopyCloseHandlers.push(callback);
      }),
    } as unknown as TestWindow;
    expect(pty.copyPty(owner, firstCopy, {
      id: 'shared-owner-close',
      cols: 80,
      rows: 24,
    })).toBe(true);
    pty.spawnPty(firstCopy, { id: 'shared-owner-close', cols: 80, rows: 24 });
    const secondCopy = window();
    expect(pty.copyPty(owner, secondCopy, {
      id: 'shared-owner-close',
      cols: 80,
      rows: 24,
    })).toBe(true);
    pty.spawnPty(secondCopy, { id: 'shared-owner-close', cols: 80, rows: 24 });

    closeOwner?.();
    const firstCopyHost = hostFor();
    pty.writePty(firstCopy, 'shared-owner-close', 'after-owner-close');

    expect(sourceHost.transfer).toHaveBeenCalledOnce();
    expect(firstCopyHost.write).toHaveBeenCalledWith('shared-owner-close', 'after-owner-close');
    expect(sourceHost.terminateAll).toHaveBeenCalledOnce();

    const copiedAfterPromotion = window();
    expect(pty.copyPty(secondCopy, copiedAfterPromotion, {
      id: 'shared-owner-close',
      cols: 80,
      rows: 24,
    })).toBe(true);
    pty.spawnPty(copiedAfterPromotion, {
      id: 'shared-owner-close',
      cols: 80,
      rows: 24,
    });
    expect(firstCopyHost.mirror).toHaveBeenCalledWith(
      'shared-owner-close',
      expect.any(Object),
    );

    for (const closeFirstCopy of firstCopyCloseHandlers) closeFirstCopy();
    const secondCopyHost = hostFor();
    expect(firstCopyHost.transfer).toHaveBeenCalledOnce();
    pty.writePty(copiedAfterPromotion, 'shared-owner-close', 'after-oldest-close');
    expect(secondCopyHost.write).toHaveBeenCalledWith(
      'shared-owner-close',
      'after-oldest-close',
    );
  });
});
