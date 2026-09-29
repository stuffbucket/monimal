import { describe, it } from "bun:test"
import assert from "node:assert/strict"

import { TerminalScopeRegistry } from "../../src/lib/auth/terminal-scope.js"

const scope = {
  sessionId: "terminal-1",
  profileId: "claude-code",
  application: "Claude Code",
}

describe("TerminalScopeRegistry", () => {
  it("issues an opaque credential that resolves to terminal provenance", () => {
    const registry = new TerminalScopeRegistry({
      now: () => Date.parse("2026-03-29T00:00:00.000Z"),
      randomCredential: () => "mxt_secret",
      ttlMs: 60_000,
    })

    const issued = registry.issue(scope)

    assert.deepEqual(issued, {
      ...scope,
      credential: "mxt_secret",
      expiresAt: "2026-03-29T00:01:00.000Z",
    })
    assert.deepEqual(registry.resolve("mxt_secret"), scope)
    assert.equal(registry.resolve("not-the-secret"), null)
  })

  it("replaces the previous credential when the same session is reissued", () => {
    const credentials = ["mxt_first", "mxt_second"]
    const registry = new TerminalScopeRegistry({
      randomCredential: () => credentials.shift() ?? "mxt_unexpected",
    })

    registry.issue(scope)
    const issued = registry.issue({ ...scope, application: "Codex" })

    assert.equal(registry.resolve("mxt_first"), null)
    assert.deepEqual(registry.resolve(issued.credential), {
      ...scope,
      application: "Codex",
    })
  })

  it("expires credentials and revokes sessions idempotently", () => {
    let now = 1_000
    const registry = new TerminalScopeRegistry({
      now: () => now,
      randomCredential: () => "mxt_expiring",
      ttlMs: 10,
    })
    registry.issue(scope)

    now = 1_010
    assert.equal(registry.resolve("mxt_expiring"), null)
    assert.deepEqual(registry.revoke(scope.sessionId), {
      sessionId: scope.sessionId,
      revoked: false,
    })

    registry.issue(scope)
    assert.deepEqual(registry.revoke(scope.sessionId), {
      sessionId: scope.sessionId,
      revoked: true,
    })
    assert.deepEqual(registry.revoke(scope.sessionId), {
      sessionId: scope.sessionId,
      revoked: false,
    })
  })
})
