import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { RuntimeIdentity } from "~/lib/host-config/types"

import {
  connectJsonTarget,
  disconnectJsonTarget,
  reconnectJsonTarget,
} from "~/lib/host-config/json-target"

let directory: string
let targetPath: string
let sidecarDirectory: string

function identity(nonce: string): RuntimeIdentity {
  return {
    nonce,
    pid: nonce === "one" ? 101 : 202,
    proxyPort: nonce === "one" ? 41_501 : 41_502,
    controlPort: nonce === "one" ? 42_501 : 42_502,
    startedAt:
      nonce === "one" ? "2026-01-01T00:00:00.000Z" : "2026-01-02T00:00:00.000Z",
  }
}

function readTarget(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(targetPath, "utf8")) as Record<
    string,
    unknown
  >
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-json-target-"))
  targetPath = path.join(directory, "settings.json")
  sidecarDirectory = path.join(directory, "sidecar")
  fs.writeFileSync(
    targetPath,
    `${JSON.stringify({ env: { KEEP: "yes", ANTHROPIC_BASE_URL: "prior" } }, null, 2)}\n`,
  )
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe("JSON target ownership", () => {
  it("claims and patches multiple fields without replacing unrelated settings", async () => {
    const result = await connectJsonTarget({
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime: identity("one"),
      probeRuntime: () => Promise.resolve(false),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
        { path: ["env", "ANTHROPIC_AUTH_TOKEN"], value: "managed-token" },
      ],
    })

    expect(result.status).toBe("connected")
    expect(readTarget()).toEqual({
      env: {
        KEEP: "yes",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:41501",
        ANTHROPIC_AUTH_TOKEN: "managed-token",
      },
    })
  })

  it("keeps the first live owner and lets the same runtime reconcile idempotently", async () => {
    const firstOptions = {
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime: identity("one"),
      probeRuntime: () => Promise.resolve(true),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
      ],
    }
    expect((await connectJsonTarget(firstOptions)).status).toBe("connected")
    expect((await connectJsonTarget(firstOptions)).status).toBe(
      "already-connected",
    )

    const before = fs.readFileSync(targetPath, "utf8")
    const second = await connectJsonTarget({
      ...firstOptions,
      runtime: identity("two"),
    })
    expect(second.status).toBe("owned-by-another-configurator")
    expect(fs.readFileSync(targetPath, "utf8")).toBe(before)
  })

  it("conditionally restores unchanged fields and preserves external changes", async () => {
    const runtime = identity("one")
    await connectJsonTarget({
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime,
      probeRuntime: () => Promise.resolve(false),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
        { path: ["env", "ANTHROPIC_AUTH_TOKEN"], value: "managed-token" },
      ],
    })
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify(
        {
          env: {
            KEEP: "changed outside Maximal",
            ANTHROPIC_BASE_URL: "http://127.0.0.1:41501",
            ANTHROPIC_AUTH_TOKEN: "external-token",
          },
        },
        null,
        2,
      )}\n`,
    )

    const result = await disconnectJsonTarget({
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime,
    })

    expect(result.status).toBe("disconnected")
    expect(result.preservedPaths).toEqual([["env", "ANTHROPIC_AUTH_TOKEN"]])
    expect(readTarget()).toEqual({
      env: {
        KEEP: "changed outside Maximal",
        ANTHROPIC_BASE_URL: "prior",
        ANTHROPIC_AUTH_TOKEN: "external-token",
      },
    })
  })

  it("stops reconciliation when a managed field changed externally", async () => {
    const runtime = identity("one")
    const options = {
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime,
      probeRuntime: () => Promise.resolve(true),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
      ],
    }
    await connectJsonTarget(options)
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify({ env: { KEEP: "yes", ANTHROPIC_BASE_URL: "external" } }, null, 2)}\n`,
    )

    const before = fs.readFileSync(targetPath, "utf8")
    expect((await connectJsonTarget(options)).status).toBe("changed-externally")
    expect(fs.readFileSync(targetPath, "utf8")).toBe(before)
  })

  it("reconnect adopts external managed values as the new restore point", async () => {
    const runtime = identity("one")
    const options = {
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime,
      probeRuntime: () => Promise.resolve(true),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
        { path: ["env", "ANTHROPIC_AUTH_TOKEN"], value: "managed-token" },
      ],
    }
    await connectJsonTarget(options)
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify(
        {
          env: {
            KEEP: "changed outside Maximal",
            ANTHROPIC_BASE_URL: "external-url",
            ANTHROPIC_AUTH_TOKEN: "external-token",
          },
        },
        null,
        2,
      )}\n`,
    )

    const reconnected = await reconnectJsonTarget(options)
    expect(reconnected.status).toBe("connected")
    expect(readTarget()).toEqual({
      env: {
        KEEP: "changed outside Maximal",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:41501",
        ANTHROPIC_AUTH_TOKEN: "managed-token",
      },
    })

    await disconnectJsonTarget({
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime,
    })
    expect(readTarget()).toEqual({
      env: {
        KEEP: "changed outside Maximal",
        ANTHROPIC_BASE_URL: "external-url",
        ANTHROPIC_AUTH_TOKEN: "external-token",
      },
    })
  })
})

describe("JSON target recovery and serialization", () => {
  it("cleans an unchanged stale owner before claiming for the new runtime", async () => {
    const baseOptions = {
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      probeRuntime: () => Promise.resolve(false),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
      ],
    }
    await connectJsonTarget({ ...baseOptions, runtime: identity("one") })

    const result = await connectJsonTarget({
      ...baseOptions,
      runtime: identity("two"),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41502",
        },
      ],
    })

    expect(result.status).toBe("connected")
    expect(readTarget()).toEqual({
      env: { KEEP: "yes", ANTHROPIC_BASE_URL: "http://127.0.0.1:41502" },
    })
    expect(result.claim?.fields[0]?.priorValue).toBe("prior")
  })

  it("preserves drift and requires explicit recovery for a stale owner", async () => {
    const baseOptions = {
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      probeRuntime: () => Promise.resolve(false),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
      ],
    }
    await connectJsonTarget({ ...baseOptions, runtime: identity("one") })
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify({ env: { KEEP: "yes", ANTHROPIC_BASE_URL: "external" } }, null, 2)}\n`,
    )

    const before = fs.readFileSync(targetPath, "utf8")
    const result = await connectJsonTarget({
      ...baseOptions,
      runtime: identity("two"),
    })
    expect(result.status).toBe("stale-recovery-required")
    expect(fs.readFileSync(targetPath, "utf8")).toBe(before)
  })

  it("finishes a journaled write whose target replacement reached disk", async () => {
    const runtime = identity("one")
    const options = {
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime,
      probeRuntime: () => Promise.resolve(true),
      fields: [
        {
          path: ["env", "ANTHROPIC_BASE_URL"],
          value: "http://127.0.0.1:41501",
        },
      ],
    }
    const connected = await connectJsonTarget(options)
    const claim = connected.claim
    if (!claim) throw new Error("Expected a target claim")
    const after = readTarget()
    const before = { env: { KEEP: "yes", ANTHROPIC_BASE_URL: "prior" } }
    fs.rmSync(path.join(sidecarDirectory, "owner.json"))
    fs.writeFileSync(
      path.join(sidecarDirectory, "journal.json"),
      `${JSON.stringify(
        {
          schema: 1,
          targetPath: path.resolve(targetPath),
          beforeFingerprint: fingerprint(before),
          afterFingerprint: fingerprint(after),
          claimAfter: claim,
        },
        null,
        2,
      )}\n`,
    )

    const result = await connectJsonTarget(options)

    expect(result.status).toBe("already-connected")
    expect(fs.existsSync(path.join(sidecarDirectory, "journal.json"))).toBe(
      false,
    )
    expect(fs.existsSync(path.join(sidecarDirectory, "owner.json"))).toBe(true)
  })

  it("stops when a journaled target has an unrecognized external value", async () => {
    const before = readTarget()
    fs.mkdirSync(sidecarDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(sidecarDirectory, "journal.json"),
      `${JSON.stringify(
        {
          schema: 1,
          targetPath: path.resolve(targetPath),
          beforeFingerprint: fingerprint(before),
          afterFingerprint: fingerprint({
            env: { KEEP: "yes", ANTHROPIC_BASE_URL: "managed" },
          }),
          claimAfter: null,
        },
        null,
        2,
      )}\n`,
    )
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify({ env: { KEEP: "yes", ANTHROPIC_BASE_URL: "external" } }, null, 2)}\n`,
    )

    const result = await connectJsonTarget({
      targetPath,
      sidecarDirectory,
      configuratorId: "claude-code",
      runtime: identity("one"),
      probeRuntime: () => Promise.resolve(false),
      fields: [{ path: ["env", "ANTHROPIC_BASE_URL"], value: "managed" }],
    })

    expect(result.status).toBe("recovery-required")
    expect(
      (readTarget().env as Record<string, unknown>).ANTHROPIC_BASE_URL,
    ).toBe("external")
  })

  it("serializes contenders and materializes fields only for the winner", async () => {
    const liveNonces = new Set(["one", "two"])
    const materialized: Array<string> = []
    const contender = (nonce: string, value: string) =>
      connectJsonTarget({
        targetPath,
        sidecarDirectory,
        configuratorId: "claude-code",
        runtime: identity(nonce),
        probeRuntime: (candidate) =>
          Promise.resolve(liveNonces.has(candidate.nonce)),
        fields: () => {
          materialized.push(nonce)
          return [{ path: ["env", "ANTHROPIC_BASE_URL"], value }]
        },
      })

    const results = await Promise.all([
      contender("one", "http://127.0.0.1:41501"),
      contender("two", "http://127.0.0.1:41502"),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      "connected",
      "owned-by-another-configurator",
    ])
    expect(materialized).toHaveLength(1)
    const written = (readTarget().env as Record<string, unknown>)
      .ANTHROPIC_BASE_URL
    expect(written).toBe(
      materialized[0] === "one" ?
        "http://127.0.0.1:41501"
      : "http://127.0.0.1:41502",
    )
  })
})
