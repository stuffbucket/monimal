import {
  TmuxProjectionHost,
  type TmuxProjectionHostOptions,
  type TmuxProjectionLaunch,
} from './tmux-projection-host.js';
import type { TmuxProjectionRequest } from './tmux-projection-broker.js';

export interface TmuxProjectionOwnersOptions<Owner>
  extends Omit<TmuxProjectionHostOptions, 'emit' | 'onExit'> {
  emit(owner: Owner, sessionId: string, projectionId: string, chunk: string): void;
  onExit(owner: Owner, sessionId: string, projectionId: string, exitCode: number): void;
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
        const owner = this.projectionOwners.get(projectionKey(sessionId, projectionId))!;
        options.emit(owner, sessionId, projectionId, chunk);
      },
      onExit: (sessionId, projectionId, exitCode) => {
        const key = projectionKey(sessionId, projectionId);
        const owner = this.projectionOwners.get(key)!;
        this.projectionOwners.delete(key);
        options.onExit(owner, sessionId, projectionId, exitCode);
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
    if (this.sessionOwners.get(sessionId) !== owner && !this.hasProjection(owner, sessionId)) {
      return false;
    }
    const recipients = this.grants.get(sessionId) ?? new Set<Owner>();
    recipients.add(recipient);
    this.grants.set(sessionId, recipients);
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
      this.host.attach(request);
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

  terminate(owner: Owner, sessionId: string): boolean {
    if (this.sessionOwners.get(sessionId) !== owner && !this.hasProjection(owner, sessionId)) {
      return false;
    }
    this.clearSession(sessionId);
    return this.host.terminate(sessionId);
  }

  release(owner: Owner): void {
    for (const key of [...this.projectionOwners.keys()]) {
      const separator = key.indexOf('\u0000');
      this.detach(owner, key.slice(0, separator), key.slice(separator + 1));
    }
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

  private hasProjection(owner: Owner, sessionId: string): boolean {
    const prefix = `${sessionId}\u0000`;
    return [...this.projectionOwners].some(([key, candidate]) => candidate === owner && key.startsWith(prefix));
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