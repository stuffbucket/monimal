import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type {
  JsonObject,
  RuntimeIdentity,
  TargetClaim,
} from "~/lib/host-config/types"

import {
  connectJsonResourceSet,
  disconnectJsonResourceSet,
  inspectJsonResourceSet,
  reconnectJsonResourceSet,
  type JsonResourcePatch,
} from "~/lib/host-config/json-resource-set"

let directory: string
let anchorPath: string
let metaPath: string
let profilePath: string
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

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function fingerprint(value: JsonObject | null): string | null {
  return value === null ? null : (
      createHash("sha256").update(JSON.stringify(value)).digest("hex")
    )
}

function resources(
  baseUrl = "http://127.0.0.1:41501",
): Array<JsonResourcePatch> {
  return [
    {
      targetPath: profilePath,
      fields: [
        { path: ["inferenceProvider"], value: "gateway" },
        { path: ["inferenceGatewayBaseUrl"], value: baseUrl },
      ],
    },
    {
      targetPath: metaPath,
      fields: [{ path: ["appliedId"], value: "maximal-profile" }],
      arrayEntries: [
        {
          path: ["entries"],
          key: "id",
          keyValue: "maximal-profile",
          value: { id: "maximal-profile", name: "Maximal" },
        },
      ],
    },
    {
      targetPath: anchorPath,
      fields: [
        { path: ["deploymentMode"], value: "3p" },
        { path: ["preferences", "coworkWebSearchEnabled"], value: true },
      ],
    },
  ]
}

function options(runtime = identity("one")) {
  return {
    anchorPath,
    sidecarDirectory,
    configuratorId: "claude-desktop",
    runtime,
    probeRuntime: () => Promise.resolve(false),
    resources: resources(),
  }
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-json-resources-"))
  anchorPath = path.join(directory, "claude_desktop_config.json")
  metaPath = path.join(directory, "configLibrary", "_meta.json")
  profilePath = path.join(directory, "configLibrary", "maximal-profile.json")
  sidecarDirectory = path.join(directory, "sidecar")
  writeJson(anchorPath, {
    deploymentMode: "prior",
    preferences: { keep: true },
  })
  writeJson(metaPath, {
    appliedId: "prior-profile",
    entries: [{ id: "prior-profile", name: "Prior" }],
  })
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe("JSON resource-set ownership", () => {
  it("claims and commits all resources while preserving unrelated fields", async () => {
    const result = await connectJsonResourceSet(options())

    expect(result.status).toBe("connected")
    expect(readJson(profilePath)).toEqual({
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: "http://127.0.0.1:41501",
    })
    expect(readJson(metaPath)).toEqual({
      appliedId: "maximal-profile",
      entries: [
        { id: "prior-profile", name: "Prior" },
        { id: "maximal-profile", name: "Maximal" },
      ],
    })
    expect(readJson(anchorPath)).toEqual({
      deploymentMode: "3p",
      preferences: { keep: true, coworkWebSearchEnabled: true },
    })
    expect(result.claim?.createdTargets).toEqual([path.resolve(profilePath)])
  })

  it("stops a live contender before changing any resource", async () => {
    const first = options(identity("one"))
    first.probeRuntime = () => Promise.resolve(true)
    await connectJsonResourceSet(first)
    const before = [profilePath, metaPath, anchorPath].map((filePath) =>
      fs.readFileSync(filePath, "utf8"),
    )

    const second = {
      ...options(identity("two")),
      probeRuntime: () => Promise.resolve(true),
      resources: resources("http://127.0.0.1:41502"),
    }
    const result = await connectJsonResourceSet(second)

    expect(result.status).toBe("owned-by-another-configurator")
    expect(
      [profilePath, metaPath, anchorPath].map((filePath) =>
        fs.readFileSync(filePath, "utf8"),
      ),
    ).toEqual(before)
  })

  it("conditionally restores each resource and retains external changes", async () => {
    const runtime = identity("one")
    await connectJsonResourceSet(options(runtime))
    writeJson(profilePath, {
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: "external",
      addedExternally: true,
    })
    const meta = readJson(metaPath)
    if (!Array.isArray(meta.entries))
      throw new Error("Expected metadata entries")
    meta.entries.push({ id: "external-profile", name: "External" })
    writeJson(metaPath, meta)
    const anchor = readJson(anchorPath)
    anchor.addedExternally = true
    writeJson(anchorPath, anchor)

    const result = await disconnectJsonResourceSet({
      anchorPath,
      sidecarDirectory,
      configuratorId: "claude-desktop",
      runtime,
    })

    expect(result.status).toBe("disconnected")
    expect(result.preservedPaths).toContainEqual(["inferenceGatewayBaseUrl"])
    expect(readJson(profilePath)).toEqual({
      inferenceGatewayBaseUrl: "external",
      addedExternally: true,
    })
    expect(readJson(metaPath)).toEqual({
      appliedId: "prior-profile",
      entries: [
        { id: "prior-profile", name: "Prior" },
        { id: "external-profile", name: "External" },
      ],
    })
    expect(readJson(anchorPath)).toEqual({
      deploymentMode: "prior",
      preferences: { keep: true },
      addedExternally: true,
    })
  })

  it("reconnect adopts drift across resources as the new inverse baseline", async () => {
    const runtime = identity("one")
    const connectOptions = options(runtime)
    await connectJsonResourceSet(connectOptions)
    writeJson(profilePath, {
      inferenceProvider: "external-provider",
      inferenceGatewayBaseUrl: "external-url",
    })
    writeJson(anchorPath, {
      deploymentMode: "external-mode",
      preferences: { keep: true, coworkWebSearchEnabled: false },
    })

    expect((await reconnectJsonResourceSet(connectOptions)).status).toBe(
      "connected",
    )
    await disconnectJsonResourceSet({
      anchorPath,
      sidecarDirectory,
      configuratorId: "claude-desktop",
      runtime,
    })

    expect(readJson(profilePath)).toEqual({
      inferenceProvider: "external-provider",
      inferenceGatewayBaseUrl: "external-url",
    })
    expect(readJson(anchorPath)).toEqual({
      deploymentMode: "external-mode",
      preferences: { keep: true, coworkWebSearchEnabled: false },
    })
  })

  it("cleans an unchanged stale resource set before the next owner writes", async () => {
    await connectJsonResourceSet(options(identity("one")))
    const next = {
      ...options(identity("two")),
      resources: resources("http://127.0.0.1:41502"),
    }

    const result = await connectJsonResourceSet(next)

    expect(result.status).toBe("connected")
    expect(readJson(profilePath).inferenceGatewayBaseUrl).toBe(
      "http://127.0.0.1:41502",
    )
    expect(
      result.claim?.fields.find(
        (field) => field.path.at(-1) === "inferenceGatewayBaseUrl",
      )?.priorExists,
    ).toBe(false)
  })

  it("finalizes all-after journals and refuses mixed journal states", async () => {
    const connectOptions = options()
    const before = new Map<string, JsonObject | null>([
      [profilePath, null],
      [metaPath, readJson(metaPath)],
      [anchorPath, readJson(anchorPath)],
    ])
    const connected = await connectJsonResourceSet(connectOptions)
    const claim = connected.claim
    if (!claim) throw new Error("Expected resource-set claim")
    const after = new Map<string, JsonObject | null>([
      [profilePath, readJson(profilePath)],
      [metaPath, readJson(metaPath)],
      [anchorPath, readJson(anchorPath)],
    ])
    const journal = {
      schema: 1,
      anchorPath: path.resolve(anchorPath),
      resources: [...after.keys()].map((targetPath) => ({
        targetPath: path.resolve(targetPath),
        beforeFingerprint: fingerprint(before.get(targetPath) ?? null),
        afterFingerprint: fingerprint(after.get(targetPath) ?? null),
      })),
      claimAfter: claim satisfies TargetClaim,
    }
    fs.rmSync(path.join(sidecarDirectory, "owner.json"))
    writeJson(path.join(sidecarDirectory, "journal.json"), journal)

    expect(
      (
        await inspectJsonResourceSet({
          anchorPath,
          sidecarDirectory,
          configuratorId: "claude-desktop",
          runtime: identity("one"),
          probeRuntime: () => Promise.resolve(true),
        })
      ).status,
    ).toBe("connected")

    fs.rmSync(path.join(sidecarDirectory, "owner.json"))
    writeJson(path.join(sidecarDirectory, "journal.json"), journal)
    writeJson(anchorPath, before.get(anchorPath) ?? {})
    const mixedBefore = [profilePath, metaPath, anchorPath].map((filePath) =>
      fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null,
    )

    expect((await connectJsonResourceSet(connectOptions)).status).toBe(
      "recovery-required",
    )
    expect(
      [profilePath, metaPath, anchorPath].map((filePath) =>
        fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null,
      ),
    ).toEqual(mixedBefore)
  })
})
