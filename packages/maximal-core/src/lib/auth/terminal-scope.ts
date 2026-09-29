import type {
  TerminalScopeCredential,
  TerminalScopeIssueRequest,
  TerminalScopeRevokeResult,
} from "@maximal/maximal-core-contract/control"

import { createHash, randomBytes } from "node:crypto"

const CREDENTIAL_PREFIX = "mxt_"
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export interface TerminalScope {
  sessionId: string
  profileId: string
  application: string | null
}

interface StoredTerminalScope extends TerminalScope {
  expiresAtMs: number
}

interface TerminalScopeRegistryOptions {
  now?: () => number
  randomCredential?: () => string
  ttlMs?: number
}

function credentialDigest(credential: string): string {
  return createHash("sha256").update(credential).digest("base64url")
}

function defaultCredential(): string {
  return `${CREDENTIAL_PREFIX}${randomBytes(24).toString("base64url")}`
}

export class TerminalScopeRegistry {
  private readonly byCredential = new Map<string, StoredTerminalScope>()
  private readonly credentialsBySession = new Map<string, Set<string>>()
  private readonly now: () => number
  private readonly randomCredential: () => string
  private readonly ttlMs: number

  constructor(options: TerminalScopeRegistryOptions = {}) {
    this.now = options.now ?? Date.now
    this.randomCredential = options.randomCredential ?? defaultCredential
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  }

  issue(input: TerminalScopeIssueRequest): TerminalScopeCredential {
    this.prune()
    this.revoke(input.sessionId)
    const credential = this.randomCredential()
    const digest = credentialDigest(credential)
    const expiresAtMs = this.now() + this.ttlMs
    this.byCredential.set(digest, { ...input, expiresAtMs })
    this.credentialsBySession.set(input.sessionId, new Set([digest]))
    return {
      ...input,
      credential,
      expiresAt: new Date(expiresAtMs).toISOString(),
    }
  }

  resolve(credential: string): TerminalScope | null {
    const digest = credentialDigest(credential)
    const scope = this.byCredential.get(digest)
    if (!scope) return null
    if (scope.expiresAtMs <= this.now()) {
      this.removeDigest(digest, scope.sessionId)
      return null
    }
    return {
      sessionId: scope.sessionId,
      profileId: scope.profileId,
      application: scope.application,
    }
  }

  revoke(sessionId: string): TerminalScopeRevokeResult {
    const digests = this.credentialsBySession.get(sessionId)
    if (!digests) return { sessionId, revoked: false }
    for (const digest of digests) this.byCredential.delete(digest)
    this.credentialsBySession.delete(sessionId)
    return { sessionId, revoked: true }
  }

  private prune(): void {
    const now = this.now()
    for (const [digest, scope] of this.byCredential) {
      if (scope.expiresAtMs <= now) this.removeDigest(digest, scope.sessionId)
    }
  }

  private removeDigest(digest: string, sessionId: string): void {
    this.byCredential.delete(digest)
    const digests = this.credentialsBySession.get(sessionId)
    digests?.delete(digest)
    if (digests?.size === 0) this.credentialsBySession.delete(sessionId)
  }
}

const defaultRegistry = new TerminalScopeRegistry()

export function issueTerminalScope(
  input: TerminalScopeIssueRequest,
): TerminalScopeCredential {
  return defaultRegistry.issue(input)
}

export function resolveTerminalScope(credential: string): TerminalScope | null {
  return defaultRegistry.resolve(credential)
}

export function revokeTerminalScope(
  sessionId: string,
): TerminalScopeRevokeResult {
  return defaultRegistry.revoke(sessionId)
}
