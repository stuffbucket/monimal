import {
  TmuxProjectionHost,
  type TmuxProjectionHostOptions,
  type TmuxProjectionLaunch,
} from './projection-host.js';
import { TmuxProjectionAuthority } from './projection-authority.js';
import type { TmuxProjectionRequest } from './projection-broker.js';

export interface TmuxProjectionOwnersOptions<Owner>
  extends Omit<TmuxProjectionHostOptions, 'emit' | 'onExit' | 'onGeometry' | 'onGeometryError'> {
  emit(owner: Owner, sessionId: string, projectionId: string, chunk: string): void;
  onExit(owner: Owner, sessionId: string, projectionId: string, exitCode: number): void;
  onGeometry?(this: void, owner: Owner, sessionId: string, projectionId: string, cols: number, rows: number): void;
  onGeometryError?(this: void, owner: Owner, sessionId: string, projectionId: string, error: unknown): void;
}

function ignoreOwnerGeometry<Owner>(
  _owner: Owner,
  _sessionId: string,
  _projectionId: string,
  _cols: number,
  _rows: number,
): void {}

function ignoreOwnerGeometryError<Owner>(
  _owner: Owner,
  _sessionId: string,
  _projectionId: string,
  _error: unknown,
): void {}

/** Routes one application-scoped tmux broker across isolated projection owners. */
export class TmuxProjectionOwners<Owner> {
  private readonly host: TmuxProjectionHost;
  private readonly authority = new TmuxProjectionAuthority<Owner>();

  constructor(private readonly options: TmuxProjectionOwnersOptions<Owner>) {
    this.host = new TmuxProjectionHost({
      ...options,
      emit: (sessionId, projectionId, chunk) => {
        const owner = this.authority.owner(sessionId, projectionId);
        if (owner === undefined) return;
        options.emit(owner, sessionId, projectionId, chunk);
      },
      onExit: (sessionId, projectionId, exitCode) => {
        const owner = this.authority.unclaim(sessionId, projectionId);
        if (owner === undefined) return;
        options.onExit(owner, sessionId, projectionId, exitCode);
      },
      onGeometry: (sessionId, cols, rows) => {
        const onGeometry = options.onGeometry ?? ignoreOwnerGeometry<Owner>;
        for (const [projectionId, owner] of this.authority.projections(sessionId)) {
          onGeometry(owner, sessionId, projectionId, cols, rows);
        }
      },
      onGeometryError: (sessionId, error) => {
        const onGeometryError = options.onGeometryError ?? ignoreOwnerGeometryError<Owner>;
        for (const [projectionId, owner] of this.authority.projections(sessionId)) {
          onGeometryError(owner, sessionId, projectionId, error);
        }
      },
    });
  }

  reserve(owner: Owner, sessionId: string, launch: TmuxProjectionLaunch): void {
    this.host.reserve(sessionId, launch);
    this.authority.reserve(owner, sessionId);
  }

  has(sessionId: string): boolean {
    return this.host.has(sessionId);
  }

  /** Sessions this owner controls, views, or has been granted permission to view. */
  list(owner: Owner): string[] {
    return this.authority.list(owner);
  }

  grant(owner: Owner, sessionId: string, recipient: Owner): boolean {
    return this.authority.grant(owner, sessionId, recipient);
  }

  revoke(owner: Owner, sessionId: string, recipient: Owner): boolean {
    return this.authority.revoke(owner, sessionId, recipient);
  }

  transfer(owner: Owner, sessionId: string, recipient: Owner): boolean {
    return this.authority.transfer(owner, sessionId, recipient);
  }

  attach(owner: Owner, request: TmuxProjectionRequest): boolean {
    const claim = this.authority.claim(owner, request.sessionId, request.projectionId);
    if (claim !== 'claimed') return claim === 'held';
    try {
      // A claim implies a reserved launch and no live broker projection, so the host accepts it.
      this.host.attach(request);
      return true;
    } catch (error) {
      this.authority.unclaim(request.sessionId, request.projectionId);
      throw error;
    }
  }

  focus(owner: Owner, sessionId: string, projectionId: string, cols: number, rows: number): number | undefined {
    return this.authority.owns(owner, sessionId, projectionId)
      ? this.host.focus(sessionId, projectionId, cols, rows)
      : undefined;
  }

  write(owner: Owner, sessionId: string, projectionId: string, epoch: number, data: string): boolean {
    return this.authority.owns(owner, sessionId, projectionId)
      && this.host.write(sessionId, projectionId, epoch, data);
  }

  resize(owner: Owner, sessionId: string, projectionId: string, epoch: number, cols: number, rows: number): boolean {
    return this.authority.owns(owner, sessionId, projectionId)
      && this.host.resize(sessionId, projectionId, epoch, cols, rows);
  }

  detach(owner: Owner, sessionId: string, projectionId: string): boolean {
    if (!this.authority.owns(owner, sessionId, projectionId)) return false;
    this.authority.unclaim(sessionId, projectionId);
    return this.host.detach(sessionId, projectionId);
  }

  detachOwner(owner: Owner, sessionId: string): boolean {
    let detached = false;
    for (const projectionId of this.projectionIds(owner, sessionId)) {
      detached = this.detach(owner, sessionId, projectionId) || detached;
    }
    return detached;
  }

  projectionIds(owner: Owner, sessionId: string): string[] {
    return this.authority.projections(sessionId).flatMap(([projectionId, projectionOwner]) =>
      projectionOwner === owner ? [projectionId] : []);
  }

  terminate(owner: Owner, sessionId: string): boolean {
    if (!this.authority.controls(owner, sessionId)) return false;
    this.authority.clearSession(sessionId);
    return this.host.terminate(sessionId);
  }

  release(owner: Owner): void {
    for (const sessionId of this.authority.viewedSessions()) this.detachOwner(owner, sessionId);
    this.authority.release(owner);
  }

  abandonAll(): void {
    this.host.abandonAll();
    this.authority.clear();
  }
}
