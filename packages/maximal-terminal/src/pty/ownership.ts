import type { PtySpawnRequest } from '../contract.js';

interface Grid {
  cols: number;
  rows: number;
}

/** The PTY registry primitives an ownership transaction may touch. */
export interface PtyOwnershipPort<Window> {
  isProjection(id: string): boolean;
  projectionIds(window: Window, id: string): Iterable<string>;
  grantProjection(owner: Window, id: string, recipient: Window, cols: number, rows: number): boolean;
  transferProjection(from: Window, id: string, to: Window): boolean;
  revokeProjection(owner: Window, id: string, recipient: Window): void;
  detachProjection(window: Window, id: string, projectionId: string): void;
  detachProjectionOwner(owner: Window, id: string): void;
  forgetProjectionEpoch(window: Window, id: string): void;
  viewerGrid(id: string, window: Window): Grid | undefined;
  trackViewerSize(id: string, window: Window, cols: number, rows: number): void;
  forgetViewerSize(id: string, window: Window): void;
  isMirror(window: Window, id: string): boolean;
  mirrorAttached(id: string, window: Window): boolean;
  realOwnerOf(window: Window, id: string): Window | undefined;
  registerMirror(owner: Window, recipient: Window, id: string): void;
  attachMirror(owner: Window, recipient: Window, request: PtySpawnRequest): void;
  detachMirror(id: string, recipient: Window): void;
  copy(owner: Window, recipient: Window, request: PtySpawnRequest): boolean;
  transfer(owner: Window, recipient: Window, request: PtySpawnRequest): boolean;
}

export interface PtyOwnershipTransaction {
  commit(): boolean;
  rollback(): void;
}

interface StagedPtyOwnership {
  request: PtySpawnRequest;
  projection: boolean;
  recipientWasMirror?: boolean;
  recipientMirrorWasAttached?: boolean;
  recipientProjectionIds: ReadonlySet<string>;
  recipientGrid?: Grid;
}

/** A moved projection has no process owner; a moved PTY records where it came from. */
type MovedPtyOwnership<Window> =
  | { entry: StagedPtyOwnership; realOwner?: undefined; sourceGrid?: undefined }
  | { entry: StagedPtyOwnership; realOwner: Window; sourceGrid?: Grid };

/**
 * Stage every request as a copy into the recipient, all or nothing. A `move`
 * commit then transfers each session and restores the originals if any fails.
 */
export function stageOwnership<Window>(
  port: PtyOwnershipPort<Window>,
  owner: Window | undefined,
  recipient: Window | undefined,
  requests: readonly PtySpawnRequest[],
  mode: 'copy' | 'move',
): PtyOwnershipTransaction | undefined {
  if (!owner || !recipient || owner === recipient || requests.length === 0)
    return undefined;
  if (new Set(requests.map(({ id }) => id)).size !== requests.length) return undefined;
  const staged: StagedPtyOwnership[] = [];

  const restoreRecipientGrid = (entry: StagedPtyOwnership): boolean => {
    if (!entry.recipientGrid) return false;
    port.trackViewerSize(entry.request.id, recipient, entry.recipientGrid.cols, entry.recipientGrid.rows);
    return true;
  };

  const rollbackDestination = (): void => {
    for (const entry of [...staged].reverse()) {
      const { id } = entry.request;
      if (entry.projection) {
        for (const projectionId of port.projectionIds(recipient, id)) {
          if (!entry.recipientProjectionIds.has(projectionId)) {
            port.detachProjection(recipient, id, projectionId);
          }
        }
        port.revokeProjection(owner, id, recipient);
        if (entry.recipientProjectionIds.size === 0) port.forgetProjectionEpoch(recipient, id);
        if (!restoreRecipientGrid(entry)) port.forgetViewerSize(id, recipient);
      } else if (!entry.recipientWasMirror) {
        port.detachMirror(id, recipient);
      } else if (!port.isMirror(recipient, id)) {
        const realOwner = port.realOwnerOf(owner, id);
        if (!realOwner) continue;
        port.registerMirror(realOwner, recipient, id);
        if (entry.recipientMirrorWasAttached) {
          port.attachMirror(realOwner, recipient, {
            ...entry.request,
            cols: entry.recipientGrid?.cols ?? entry.request.cols,
            rows: entry.recipientGrid?.rows ?? entry.request.rows,
          });
        } else {
          restoreRecipientGrid(entry);
        }
      }
    }
  };

  for (const request of requests) {
    const recipientGrid = port.viewerGrid(request.id, recipient);
    if (port.isProjection(request.id)) {
      const recipientProjectionIds = new Set(port.projectionIds(recipient, request.id));
      if (!port.grantProjection(owner, request.id, recipient, request.cols, request.rows)) {
        rollbackDestination();
        return undefined;
      }
      staged.push({
        request,
        projection: true,
        recipientProjectionIds,
        recipientGrid,
      });
      continue;
    }
    const recipientWasMirror = port.isMirror(recipient, request.id);
    const recipientMirrorWasAttached = port.mirrorAttached(request.id, recipient);
    if (!port.copy(owner, recipient, request)) {
      rollbackDestination();
      return undefined;
    }
    staged.push({
      request,
      projection: false,
      recipientWasMirror,
      recipientMirrorWasAttached,
      recipientProjectionIds: new Set(),
      recipientGrid,
    });
  }

  const undoMoves = (moved: readonly MovedPtyOwnership<Window>[]): void => {
    for (const prior of [...moved].reverse()) {
      if (prior.realOwner === undefined) {
        port.transferProjection(recipient, prior.entry.request.id, owner);
      } else {
        port.transfer(recipient, prior.realOwner, {
          ...prior.entry.request,
          cols: prior.sourceGrid?.cols ?? prior.entry.request.cols,
          rows: prior.sourceGrid?.rows ?? prior.entry.request.rows,
        });
      }
    }
    rollbackDestination();
  };

  let finished = false;
  return {
    commit(): boolean {
      if (finished) return false;
      finished = true;
      if (mode === 'copy') return true;

      const moved: MovedPtyOwnership<Window>[] = [];
      for (const entry of staged) {
        if (entry.projection) {
          if (!port.transferProjection(owner, entry.request.id, recipient)) {
            undoMoves(moved);
            return false;
          }
          moved.push({ entry });
          continue;
        }
        const realOwner = port.realOwnerOf(owner, entry.request.id);
        if (!realOwner) {
          undoMoves(moved);
          return false;
        }
        const sourceGrid = port.viewerGrid(entry.request.id, realOwner);
        if (!port.transfer(owner, recipient, entry.request)) {
          undoMoves(moved);
          return false;
        }
        moved.push({ entry, realOwner, sourceGrid });
      }

      for (const entry of staged) {
        if (!entry.projection) continue;
        const { id, cols, rows } = entry.request;
        port.revokeProjection(recipient, id, recipient);
        port.detachProjectionOwner(owner, id);
        port.forgetProjectionEpoch(owner, id);
        port.forgetViewerSize(id, owner);
        port.trackViewerSize(id, recipient, cols, rows);
      }
      return true;
    },
    rollback(): void {
      if (finished) return;
      finished = true;
      rollbackDestination();
    },
  };
}
