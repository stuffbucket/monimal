import { clampTerminalGrid } from '../../shared/terminal-grid.js';

export interface TerminalGrid {
  cols: number;
  rows: number;
}

export interface ResizableTerminalWindow {
  isDestroyed(): boolean;
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
}

export type PhysicalResizeCapability = 'native-window' | 'unavailable';

export type TerminalGeometryCause = 'attach' | 'detach' | 'user' | 'applied';

export interface TerminalGeometry<W> {
  grid: TerminalGrid;
  origin?: W;
  revision: number;
  cause: TerminalGeometryCause;
}

interface SessionState<W> {
  groupId: string;
  viewers: Map<W, TerminalGrid>;
  geometry?: TerminalGeometry<W>;
}

interface AppliedWindowGeometry {
  groupId: string;
  remainingSessions: Set<string>;
  grids: Map<string, TerminalGrid>;
  width: number;
  height: number;
}

/**
 * Owns geometry for shared terminal documents.
 *
 * PTY grids remain session-specific because split leaves can have different
 * dimensions. Physical window geometry is document-specific: only the root
 * session can nominate a new OS window size, and one applied resize is consumed
 * as an echo for every split leaf observed in the target window.
 */
export class TerminalWindowGroups<W extends ResizableTerminalWindow> {
  private readonly sessions = new Map<string, SessionState<W>>();
  private readonly groups = new Map<string, Set<string>>();
  private readonly groupMembers = new Map<string, Map<W, number>>();
  private readonly appliedWindows = new Map<W, AppliedWindowGeometry>();
  private nextRevision = 1;
  private previousMemberIndex = 0;

  constructor(
    private readonly physicalResizeCapability: (window: W) => PhysicalResizeCapability,
    private readonly now: () => number = Date.now,
  ) {}

  registerViewer(sessionId: string, window: W): number {
    const groupId = this.session(sessionId).groupId;
    const members = this.members(groupId);
    const existing = members.get(window);
    if (existing !== undefined) return existing;
    const index = Math.max(this.now(), this.previousMemberIndex + 1);
    this.previousMemberIndex = index;
    members.set(window, index);
    return index;
  }

  observe(sessionId: string, window: W, cols: number, rows: number): boolean {
    const session = this.session(sessionId);
    this.registerViewer(sessionId, window);
    const observed = clampTerminalGrid(cols, rows);
    const applied = this.appliedWindows.get(window);
    if (!applied || applied.groupId !== session.groupId || !applied.remainingSessions.delete(sessionId)) {
      session.viewers.set(window, observed);
      return false;
    }
    const [width = 0, height = 0] = window.getContentSize();
    if (width !== applied.width || height !== applied.height) {
      this.appliedWindows.delete(window);
      session.viewers.set(window, observed);
      return false;
    }
    session.viewers.set(window, applied.grids.get(sessionId) ?? observed);
    if (applied.remainingSessions.size === 0) this.appliedWindows.delete(window);
    return true;
  }

  hasViewer(sessionId: string, window: W): boolean {
    return this.sessions.get(sessionId)?.viewers.has(window) ?? false;
  }

  viewers(sessionId: string): ReadonlyMap<W, TerminalGrid> | undefined {
    return this.sessions.get(sessionId)?.viewers;
  }

  setDocument(rootSessionId: string, sessionIds: readonly string[]): void {
    const members = new Set([rootSessionId, ...sessionIds]);
    const rootMembers = this.members(rootSessionId);
    for (const sessionId of members) {
      const session = this.session(sessionId);
      const previousGroupId = session.groupId;
      if (previousGroupId !== rootSessionId) {
        const previousMembers = this.groupMembers.get(previousGroupId);
        for (const viewer of session.viewers.keys()) {
          const previousIndex = previousMembers?.get(viewer);
          const rootIndex = rootMembers.get(viewer);
          if (previousIndex !== undefined && (rootIndex === undefined || previousIndex < rootIndex)) {
            rootMembers.set(viewer, previousIndex);
          }
        }
        this.groups.get(previousGroupId)?.delete(sessionId);
        this.pruneGroup(previousGroupId);
      }
      session.groupId = rootSessionId;
    }
    this.groups.set(rootSessionId, members);
  }

  removeViewer(sessionId: string, window: W): boolean {
    const session = this.sessions.get(sessionId);
    const removed = session?.viewers.delete(window) ?? false;
    this.appliedWindows.get(window)?.remainingSessions.delete(sessionId);
    if (session) this.pruneMember(session.groupId, window);
    return removed;
  }

  removeWindow(window: W): void {
    this.appliedWindows.delete(window);
    for (const session of this.sessions.values()) session.viewers.delete(window);
    for (const members of this.groupMembers.values()) members.delete(window);
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    const group = this.groups.get(session.groupId);
    group?.delete(sessionId);
    this.pruneGroup(session.groupId);
    for (const applied of this.appliedWindows.values()) {
      applied.remainingSessions.delete(sessionId);
    }
  }

  reconcile(
    sessionId: string,
    cause: Exclude<TerminalGeometryCause, 'applied'>,
    applyGrid: (grid: TerminalGrid, geometry: TerminalGeometry<W>) => void,
    requestor?: W,
  ): TerminalGeometry<W> | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.viewers.size === 0) return undefined;
    const grid = requestor
      ? session.viewers.get(requestor)
      : smallestGrid(session.viewers.values());
    if (!grid) return undefined;

    const previous = session.geometry;
    const changed = previous?.grid.cols !== grid.cols || previous.grid.rows !== grid.rows;
    const geometry: TerminalGeometry<W> = changed || !previous
      ? { grid, origin: requestor, revision: this.nextRevision++, cause }
      : previous;
    session.geometry = geometry;
    if (changed || !previous) applyGrid(grid, geometry);

    if (cause === 'user' && requestor && session.groupId === sessionId) {
      this.synchronizePhysicalWindows(session.groupId, requestor);
    }
    return geometry;
  }

  canonical(sessionId: string): TerminalGeometry<W> | undefined {
    return this.sessions.get(sessionId)?.geometry;
  }

  memberIndex(sessionId: string, window: W): number | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.groupMembers.get(session.groupId)?.get(window) : undefined;
  }

  oldestViewer(sessionId: string, predicate: (window: W) => boolean): W | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const members = this.groupMembers.get(session.groupId);
    let oldest: { window: W; index: number } | undefined;
    for (const window of session.viewers.keys()) {
      if (!predicate(window)) continue;
      const index = members?.get(window);
      if (index !== undefined && (!oldest || index < oldest.index)) oldest = { window, index };
    }
    return oldest?.window;
  }

  private synchronizePhysicalWindows(groupId: string, requestor: W): void {
    if (requestor.isDestroyed()) return;
    const [width = 0, height = 0] = requestor.getContentSize();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const members = this.groups.get(groupId) ?? new Set([groupId]);
    const viewers = new Set<W>();
    for (const sessionId of members) {
      for (const viewer of this.sessions.get(sessionId)?.viewers.keys() ?? []) viewers.add(viewer);
    }
    for (const viewer of viewers) {
      if (
        viewer === requestor
        || viewer.isDestroyed()
        || this.physicalResizeCapability(viewer) !== 'native-window'
      ) continue;
      const [currentWidth, currentHeight] = viewer.getContentSize();
      if (currentWidth === width && currentHeight === height) continue;
      const remainingSessions = new Set(
        [...members].filter((sessionId) => this.sessions.get(sessionId)?.viewers.has(viewer)),
      );
      const grids = new Map(
        [...remainingSessions].flatMap((sessionId) => {
          const grid = this.sessions.get(sessionId)?.geometry?.grid;
          return grid ? [[sessionId, grid] as const] : [];
        }),
      );
      this.appliedWindows.set(viewer, { groupId, remainingSessions, grids, width, height });
      viewer.setContentSize(width, height);
    }
  }

  private session(sessionId: string): SessionState<W> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const created = { groupId: sessionId, viewers: new Map<W, TerminalGrid>() };
    this.sessions.set(sessionId, created);
    this.groups.set(sessionId, new Set([sessionId]));
    return created;
  }

  private members(groupId: string): Map<W, number> {
    const existing = this.groupMembers.get(groupId);
    if (existing) return existing;
    const created = new Map<W, number>();
    this.groupMembers.set(groupId, created);
    return created;
  }

  private pruneMember(groupId: string, window: W): void {
    const group = this.groups.get(groupId);
    if (
      group
      && [...group].some((sessionId) => this.sessions.get(sessionId)?.viewers.has(window))
    ) return;
    this.groupMembers.get(groupId)?.delete(window);
  }

  private pruneGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (group && group.size > 0) return;
    this.groups.delete(groupId);
    this.groupMembers.delete(groupId);
  }
}

function smallestGrid(grids: Iterable<TerminalGrid>): TerminalGrid | undefined {
  let cols = Infinity;
  let rows = Infinity;
  for (const grid of grids) {
    cols = Math.min(cols, grid.cols);
    rows = Math.min(rows, grid.rows);
  }
  return Number.isFinite(cols) && Number.isFinite(rows) ? { cols, rows } : undefined;
}
