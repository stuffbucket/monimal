import {
  TmuxProjectionHost,
  type TmuxProjectionHostOptions,
  type TmuxProjectionLaunch,
} from './tmux-projection-host.js';
import type { TmuxProjectionRequest } from './tmux-projection-broker.js';

export interface TmuxProjectionOwnersOptions<Owner>
  extends Omit<TmuxProjectionHostOptions, 'emit' | 'onExit' | 'onGeometry' | 'onGeometryError'> {
  emit(owner: Owner, sessionId: string, projectionId: string, chunk: string): void;
  onExit(owner: Owner, sessionId: string, projectionId: string, exitCode: number): void;
  onGeometry?(owner: Owner, sessionId: string, projectionId: string, cols: number, rows: number): void;
  onGeometryError?(owner: Owner, sessionId: string, projectionId: string, error: unknown): void;
}

function projectionKey(sessionId: string, projectionId: string): string {
  return `${sessionId}\u0000${projectionId}`;
}

/** Routes one application-scoped tmux broker across isolated projection owners. */
export class TmuxProjectionOwners<Owner> {
  private readonly host: TmuxProjectionHost;
  private readonly sessionOwners = new Map<string, Owner>();
  private readonly projectionOwners = new Map<string, Owner>();
  private readonly grants = new Map<string, Set<Owner>>();

  constructor(private readonly options: TmuxProjectionOwnersOptions<Owner>) {
    this.host = new TmuxProjectionHost({
      ...options,
      emit: (sessionId, projectionId, chunk) => {
        const owner = this.projectionOwners.get(projectionKey(sessionId, projectionId));
        if (owner === undefined) return;
        options.emit(owner, sessionId, projectionId, chunk);
      },
      onExit: (sessionId, projectionId, exitCode) => {
        const key = projectionKey(sessionId, projectionId);
        const owner = this.projectionOwners.get(key);
        this.projectionOwners.delete(key);
        if (owner === undefined) return;
        options.onExit(owner, sessionId, projectionId, exitCode);
      },
      onGeometry: (sessionId, cols, rows) => {
        for (const [projectionId, owner] of this.sessionProjections(sessionId)) {
          options.onGeometry?.(owner, sessionId, projectionId, cols, rows);
        }
      },
      onGeometryError: (sessionId, error) => {
        for (const [projectionId, owner] of this.sessionProjections(sessionId)) {
          options.onGeometryError?.(owner, sessionId, projectionId, error);
        }
      },
    });
  }

  reserve(owner: Owner, sessionId: string, launch: TmuxProjectionLaunch): void {
    this.host.reserve(sessionId, launch);
    this.sessionOwners.set(sessionId, owner);
  }

  has(sessionId: string): boolean {
    return this.host.has(sessionId);
  }

  grant(owner: Owner, sessionId: string, recipient: Owner): boolean {
    if (!this.controls(owner, sessionId)) return false;
    const recipients = this.grants.get(sessionId) ?? new Set<Owner>();
    recipients.add(recipient);
    this.grants.set(sessionId, recipients);
    return true;
  }

  revoke(owner: Owner, sessionId: string, recipient: Owner): boolean {
    if (!this.controls(owner, sessionId)) return false;
    const recipients = this.grants.get(sessionId);
    const revoked = recipients?.delete(recipient) ?? false;
    if (recipients?.size === 0) this.grants.delete(sessionId);
    return revoked;
  }

  transfer(owner: Owner, sessionId: string, recipient: Owner): boolean {
    if (!this.controls(owner, sessionId)) return false;
    this.sessionOwners.set(sessionId, recipient);
    return true;
  }

  attach(owner: Owner, request: TmuxProjectionRequest): boolean {
    const allowed = this.sessionOwners.get(request.sessionId) === owner
      || this.grants.get(request.sessionId)?.delete(owner) === true;
    if (!allowed) return false;
    const key = projectionKey(request.sessionId, request.projectionId);
    if (this.projectionOwners.has(key)) return false;
    this.projectionOwners.set(key, owner);
    try {
      if (!this.host.attach(request)) {
        this.projectionOwners.delete(key);
        return false;
      }
      return true;
    } catch (error) {
      this.projectionOwners.delete(key);
      throw error;
    }
  }

  focus(owner: Owner, sessionId: string, projectionId: string, cols: number, rows: number): number | undefined {
    return this.owns(owner, sessionId, projectionId)
      ? this.host.focus(sessionId, projectionId, cols, rows)
      : undefined;
  }

  write(owner: Owner, sessionId: string, projectionId: string, epoch: number, data: string): boolean {
    return this.owns(owner, sessionId, projectionId)
      && this.host.write(sessionId, projectionId, epoch, data);
  }

  resize(owner: Owner, sessionId: string, projectionId: string, epoch: number, cols: number, rows: number): boolean {
    return this.owns(owner, sessionId, projectionId)
      && this.host.resize(sessionId, projectionId, epoch, cols, rows);
  }

  detach(owner: Owner, sessionId: string, projectionId: string): boolean {
    if (!this.owns(owner, sessionId, projectionId)) return false;
    this.projectionOwners.delete(projectionKey(sessionId, projectionId));
    return this.host.detach(sessionId, projectionId);
  }

  detachOwner(owner: Owner, sessionId: string): boolean {
    let detached = false;
    for (const [projectionId, projectionOwner] of this.sessionProjections(sessionId)) {
      if (projectionOwner !== owner) continue;
      detached = this.detach(owner, sessionId, projectionId) || detached;
    }
    return detached;
  }

  projectionIds(owner: Owner, sessionId: string): string[] {
    return this.sessionProjections(sessionId).flatMap(([projectionId, projectionOwner]) =>
      projectionOwner === owner ? [projectionId] : []);
  }

  terminate(owner: Owner, sessionId: string): boolean {
    const ownsProjection = [...this.projectionOwners.entries()].some(([key, projectionOwner]) =>
      projectionOwner === owner && key.startsWith(`${sessionId}\u0000`));
    if (this.sessionOwners.get(sessionId) !== owner && !ownsProjection) return false;
    this.clearSession(sessionId);
    return this.host.terminate(sessionId);
  }

  release(owner: Owner): void {
    const sessionIds = new Set(
      [...this.projectionOwners.keys()].map((key) => key.slice(0, key.indexOf('\u0000'))),
    );
    for (const sessionId of sessionIds) this.detachOwner(owner, sessionId);
    for (const recipients of this.grants.values()) recipients.delete(owner);
    for (const [sessionId, sessionOwner] of this.sessionOwners) {
      if (sessionOwner === owner) this.sessionOwners.delete(sessionId);
    }
  }

  abandonAll(): void {
    this.host.abandonAll();
    this.sessionOwners.clear();
    this.projectionOwners.clear();
    this.grants.clear();
  }

  private owns(owner: Owner, sessionId: string, projectionId: string): boolean {
    return this.projectionOwners.get(projectionKey(sessionId, projectionId)) === owner;
  }

  private controls(owner: Owner, sessionId: string): boolean {
    if (this.sessionOwners.get(sessionId) === owner) return true;
    const prefix = `${sessionId}\u0000`;
    return [...this.projectionOwners.entries()].some(([key, projectionOwner]) =>
      projectionOwner === owner && key.startsWith(prefix));
  }

  private sessionProjections(sessionId: string): Array<[string, Owner]> {
    const prefix = `${sessionId}\u0000`;
    return [...this.projectionOwners.entries()].flatMap(([key, owner]) =>
      key.startsWith(prefix) ? [[key.slice(prefix.length), owner]] : [],
    );
  }

  private clearSession(sessionId: string): void {
    const prefix = `${sessionId}\u0000`;
    this.sessionOwners.delete(sessionId);
    this.grants.delete(sessionId);
    for (const key of this.projectionOwners.keys()) {
      if (key.startsWith(prefix)) this.projectionOwners.delete(key);
    }
  }
}