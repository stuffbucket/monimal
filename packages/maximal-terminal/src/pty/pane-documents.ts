import type { TerminalPane } from '../pane.js';

interface PaneWindow {
  readonly id: number;
  isDestroyed(): boolean;
}

export interface PaneDocument<Window> {
  pane: TerminalPane;
  revision: number;
  origin: string;
  viewers: Set<Window>;
}

export interface PaneSessionOwner<Window> {
  owner: Window;
  projection: boolean;
}

export interface PtyPaneDocumentsOptions<Window> {
  viewers(id: string): ReadonlyMap<Window, unknown> | undefined;
  /** The live owner of a pane session, or undefined while it has not spawned yet. */
  resolveSession(requestor: Window, sessionId: string): PaneSessionOwner<Window> | undefined;
  setDocument(id: string, sessionIds: string[]): void;
  /** Let a viewer mirror a session owned by another window. */
  share(owner: Window, viewer: Window, sessionId: string): void;
  publish(viewer: Window, id: string, document: PaneDocument<Window>): void;
}

export function paneSessionIds(pane: TerminalPane): string[] {
  return 'sessionId' in pane
    ? [pane.sessionId]
    : [...paneSessionIds(pane.first), ...paneSessionIds(pane.second)];
}

/**
 * Main-owned split-pane layouts shared by every window viewing a session. A
 * sync waits until every pane session it names is live, then publishes one
 * revision to all viewers and authorizes them to mirror its sessions.
 */
export class PtyPaneDocuments<Window extends PaneWindow> {
  private readonly pending = new Map<string, { requestor: Window; pane: TerminalPane }>();
  private readonly documents = new Map<string, PaneDocument<Window>>();
  private readonly sessionViewers = new Map<string, Set<Window>>();

  constructor(private readonly options: PtyPaneDocumentsOptions<Window>) {}

  get(id: string): PaneDocument<Window> | undefined {
    return this.documents.get(id);
  }

  request(id: string, requestor: Window, pane: TerminalPane): void {
    this.pending.set(id, { requestor, pane });
    this.flush();
  }

  flush(): void {
    for (const [id, pending] of this.pending) {
      const viewers = this.options.viewers(id);
      if (!viewers || viewers.size === 0) {
        this.pending.delete(id);
        continue;
      }
      const sessionIds = paneSessionIds(pending.pane);
      const sessions = this.resolveAll(pending.requestor, sessionIds);
      if (!sessions) continue;
      this.options.setDocument(id, sessionIds);
      for (const { sessionId, owner, projection } of sessions) {
        if (projection) continue;
        this.sessionViewers.set(sessionId, new Set(viewers.keys()));
        for (const [viewer] of viewers) {
          if (viewer !== owner) this.options.share(owner, viewer, sessionId);
        }
      }
      const document = {
        pane: pending.pane,
        revision: (this.documents.get(id)?.revision ?? 0) + 1,
        origin: String(pending.requestor.id),
        viewers: new Set(viewers.keys()),
      };
      this.documents.set(id, document);
      for (const [viewer] of viewers) {
        if (!viewer.isDestroyed()) this.options.publish(viewer, id, document);
      }
      this.pending.delete(id);
    }
  }

  private resolveAll(
    requestor: Window,
    sessionIds: readonly string[],
  ): Array<PaneSessionOwner<Window> & { sessionId: string }> | undefined {
    const resolved = [];
    for (const sessionId of sessionIds) {
      const session = this.options.resolveSession(requestor, sessionId);
      if (!session) return undefined;
      resolved.push({ sessionId, ...session });
    }
    return resolved;
  }

  isAuthorizedViewer(window: Window, sessionId: string): boolean {
    if (this.sessionViewers.get(sessionId)?.has(window)) return true;
    for (const document of this.documents.values()) {
      if (document.viewers.has(window) && paneSessionIds(document.pane).includes(sessionId)) return true;
    }
    return false;
  }

  forgetWindow(window: Window): void {
    for (const viewers of this.sessionViewers.values()) viewers.delete(window);
    for (const document of this.documents.values()) document.viewers.delete(window);
  }

  forgetSession(id: string): void {
    this.pending.delete(id);
    this.sessionViewers.delete(id);
    this.documents.delete(id);
  }
}
