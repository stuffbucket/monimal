/** Outcome of an owner asking to view a projection. */
export type TmuxProjectionClaim = 'claimed' | 'held' | 'denied';

/** Records who controls each tmux session, who views each projection, and who may join. */
export class TmuxProjectionAuthority<Owner> {
  private readonly sessionOwners = new Map<string, Owner>();
  private readonly projectionOwners = new Map<string, Map<string, Owner>>();
  private readonly grants = new Map<number, { sessionId: string; recipient: Owner }>();
  private nextGrantId = 0;

  reserve(owner: Owner, sessionId: string): void {
    this.sessionOwners.set(sessionId, owner);
  }

  /** The session owner and every projection owner in the session control it. */
  controls(owner: Owner, sessionId: string): boolean {
    return this.sessionOwners.get(sessionId) === owner
      || this.projections(sessionId).some(([, projectionOwner]) => projectionOwner === owner);
  }

  owns(owner: Owner, sessionId: string, projectionId: string): boolean {
    return this.owner(sessionId, projectionId) === owner;
  }

  owner(sessionId: string, projectionId: string): Owner | undefined {
    return this.projectionOwners.get(sessionId)?.get(projectionId);
  }

  projections(sessionId: string): Array<[string, Owner]> {
    return [...this.projectionOwners.get(sessionId) ?? []];
  }

  /** Sessions this owner controls, views, or has been granted permission to view. */
  list(owner: Owner): string[] {
    const sessionIds = new Set<string>();
    for (const [sessionId, sessionOwner] of this.sessionOwners) {
      if (sessionOwner === owner) sessionIds.add(sessionId);
    }
    for (const [sessionId, projections] of this.projectionOwners) {
      if ([...projections.values()].includes(owner)) sessionIds.add(sessionId);
    }
    for (const grant of this.grantEntries()) {
      if (grant.recipient === owner) sessionIds.add(grant.sessionId);
    }
    return [...sessionIds];
  }

  /** Sessions with at least one viewed projection. */
  viewedSessions(): string[] {
    return [...this.projectionOwners.keys()];
  }

  grant(owner: Owner, sessionId: string, recipient: Owner): boolean {
    if (!this.controls(owner, sessionId)) return false;
    if (this.grantIndex(sessionId, recipient) < 0) {
      this.grants.set(this.nextGrantId++, { sessionId, recipient });
    }
    return true;
  }

  revoke(owner: Owner, sessionId: string, recipient: Owner): boolean {
    if (!this.controls(owner, sessionId)) return false;
    const grant = this.grantIndex(sessionId, recipient);
    if (grant < 0) return false;
    this.grants.delete(grant);
    return true;
  }

  transfer(owner: Owner, sessionId: string, recipient: Owner): boolean {
    if (!this.controls(owner, sessionId)) return false;
    this.sessionOwners.set(sessionId, recipient);
    return true;
  }

  /** Claims an unviewed projection for the session owner, or by consuming a one-time grant. */
  claim(owner: Owner, sessionId: string, projectionId: string): TmuxProjectionClaim {
    const existingOwner = this.owner(sessionId, projectionId);
    if (existingOwner !== undefined) return existingOwner === owner ? 'held' : 'denied';
    const grant = this.grantIndex(sessionId, owner);
    if (this.sessionOwners.get(sessionId) !== owner) {
      if (grant < 0) return 'denied';
      this.grants.delete(grant);
    }
    const projections = this.projectionOwners.get(sessionId) ?? new Map<string, Owner>();
    projections.set(projectionId, owner);
    this.projectionOwners.set(sessionId, projections);
    return 'claimed';
  }

  /** Forgets a projection's viewer and returns who it was. */
  unclaim(sessionId: string, projectionId: string): Owner | undefined {
    const projections = this.projectionOwners.get(sessionId);
    const owner = projections?.get(projectionId);
    projections?.delete(projectionId);
    if (projections?.size === 0) this.projectionOwners.delete(sessionId);
    return owner;
  }

  /** Drops the owner's grants and session ownerships; projections are detached by the caller. */
  release(owner: Owner): void {
    for (const [grantId, grant] of this.grants) {
      if (grant.recipient === owner) this.grants.delete(grantId);
    }
    for (const [sessionId, sessionOwner] of this.sessionOwners) {
      if (sessionOwner === owner) this.sessionOwners.delete(sessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.sessionOwners.delete(sessionId);
    for (const [grantId, grant] of this.grants) {
      if (grant.sessionId === sessionId) this.grants.delete(grantId);
    }
    this.projectionOwners.delete(sessionId);
  }

  clear(): void {
    this.sessionOwners.clear();
    this.projectionOwners.clear();
    this.grants.clear();
  }

  private *grantEntries(): Iterable<{ sessionId: string; recipient: Owner }> {
    yield* this.grants.values();
  }

  private grantIndex(sessionId: string, recipient: Owner): number {
    for (const [grantId, grant] of this.grants) {
      if (grant.sessionId === sessionId && grant.recipient === recipient) return grantId;
    }
    return -1;
  }
}
