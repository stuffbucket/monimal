/** What the registry does on a mirror's behalf; the mirror state itself stays here. */
export interface PtyMirrorsOptions<Window> {
  onClosed(window: Window, listener: () => void): void;
  /** Stream the owner's session to `recipient`; undefined when there is nothing to stream. */
  subscribe(owner: Window, recipient: Window, id: string, onExit: () => void): (() => void) | undefined;
  /** A mirror stopped viewing `id`. `preserveViewer` keeps its grid for an ownership handoff. */
  onDetached(id: string, recipient: Window, preserveViewer: boolean): void;
  onWindowForgotten(window: Window): void;
}

/**
 * One window owns each local PTY process; any other window viewing it is a
 * mirror. A mirror is registered when it is granted the session and attached
 * once it subscribes to the output. Mirrors never chain: every mirror resolves
 * straight to the process owner.
 */
export class PtyMirrors<Window extends object> {
  private readonly owners = new Map<string, Window>();
  private readonly mirrored = new WeakMap<Window, Set<string>>();
  private readonly subscriptions = new WeakMap<Window, Map<string, () => void>>();
  private readonly hooked = new WeakSet<Window>();

  constructor(private readonly options: PtyMirrorsOptions<Window>) {}

  ownerOf(id: string): Window | undefined {
    return this.owners.get(id);
  }

  setOwner(id: string, owner: Window): void {
    this.owners.set(id, owner);
  }

  forgetOwner(id: string): void {
    this.owners.delete(id);
  }

  ownedBy(owner: Window): string[] {
    return [...this.owners].filter(([, window]) => window === owner).map(([id]) => id);
  }

  isMirror(window: Window, id: string): boolean {
    return this.mirrored.get(window)?.has(id) ?? false;
  }

  mirroredBy(window: Window): readonly string[] {
    return [...(this.mirrored.get(window) ?? [])];
  }

  isAttached(id: string, window: Window): boolean {
    return this.subscriptions.get(window)?.has(id) ?? false;
  }

  realOwnerOf(window: Window, id: string): Window | undefined {
    return this.isMirror(window, id) ? this.owners.get(id) : window;
  }

  register(recipient: Window, id: string): void {
    const ids = this.mirrored.get(recipient) ?? new Set<string>();
    ids.add(id);
    this.mirrored.set(recipient, ids);
    if (this.hooked.has(recipient)) return;
    this.hooked.add(recipient);
    this.options.onClosed(recipient, () => this.forgetWindow(recipient));
  }

  /** Subscribe a registered mirror to the owner's output, replacing any earlier subscription. */
  attach(owner: Window, recipient: Window, id: string): boolean {
    const byId = this.subscriptions.get(recipient) ?? new Map<string, () => void>();
    byId.get(id)?.();
    const unsubscribe = this.options.subscribe(owner, recipient, id, () => this.detach(id, recipient));
    if (!unsubscribe) return false;
    byId.set(id, unsubscribe);
    this.subscriptions.set(recipient, byId);
    return true;
  }

  detach(id: string, recipient: Window, preserveViewer = false): void {
    const byId = this.subscriptions.get(recipient);
    byId?.get(id)?.();
    byId?.delete(id);
    this.mirrored.get(recipient)?.delete(id);
    this.options.onDetached(id, recipient, preserveViewer);
  }

  private forgetWindow(window: Window): void {
    const ids = this.mirrored.get(window);
    if (!ids) return;
    for (const id of [...ids]) this.detach(id, window);
    this.mirrored.delete(window);
    this.options.onWindowForgotten(window);
  }
}
