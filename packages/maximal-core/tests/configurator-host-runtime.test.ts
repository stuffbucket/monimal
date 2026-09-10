import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type {
  ConfiguratorMetadata,
  ConfiguratorPatchFactory,
} from "~/lib/configurator-host"
import type { RuntimeIdentity } from "~/lib/host-config/types"

import { detectClaudeInstalls } from "~/lib/configurator-effects/claude-code-detect"
import { claudeAppInstalled } from "~/lib/configurator-effects/claude-desktop-detect"
import { copilotCliInstalled } from "~/lib/configurator-effects/copilot-cli-detect"
import { BUILTIN_CONFIGURATOR_TARGETS } from "~/lib/configurator-host"
import {
  createConfiguratorHost,
  type ConfiguratorHostRuntimeDependencies,
} from "~/lib/configurator-host-runtime"

const metadata: ConfiguratorMetadata = {
  id: "claude-code",
  name: "Claude Code",
  targetId: BUILTIN_CONFIGURATOR_TARGETS.claudeCode,
  credentialBinding: {
    kind: "bearer-env",
    name: "ANTHROPIC_AUTH_TOKEN",
  },
}

const patch: ConfiguratorPatchFactory = (material) => ({
  targetId: metadata.targetId,
  fields: [
    { path: ["env", "ANTHROPIC_BASE_URL"], value: material.baseUrl },
    {
      path: ["env", "ANTHROPIC_AUTH_TOKEN"],
      value: material.credential ?? "",
    },
  ],
})

let directory: string
let targetPath: string
let keyWrites: Array<string>
let keyDisables: Array<string>

function runtime(nonce: string): RuntimeIdentity {
  return {
    nonce,
    pid: nonce === "one" ? 101 : 202,
    proxyPort: nonce === "one" ? 41_501 : 41_502,
    controlPort: nonce === "one" ? 42_501 : 42_502,
    startedAt:
      nonce === "one" ? "2026-01-01T00:00:00.000Z" : "2026-01-02T00:00:00.000Z",
  }
}

function dependencies(
  identity: RuntimeIdentity,
): Partial<ConfiguratorHostRuntimeDependencies> {
  return {
    claudeCodeInstalled: () => true,
    claudeDesktopInstalled: () => true,
    claudeCodeSettingsPath: () => targetPath,
    claudeDesktopPaths: () => ({
      anchorPath: path.join(directory, "desktop", "claude_desktop_config.json"),
      metaPath: path.join(directory, "desktop", "configLibrary", "_meta.json"),
      profilePath: path.join(
        directory,
        "desktop",
        "configLibrary",
        "maximal-test.json",
      ),
      workspaceDirectory: path.join(directory, "Claude"),
    }),
    currentRuntimeIdentity: () => identity,
    probeRuntimeIdentity: () => Promise.resolve(true),
    ensureManagedApiKey: (configuratorId, label) => {
      keyWrites.push(identity.nonce)
      return {
        id: `managed:${configuratorId}`,
        label,
        key: `mxl_${identity.nonce}_credential`,
        enabled: true,
        created_at: "2026-01-01T00:00:00.000Z",
        kind: "managed",
        configurator_id: configuratorId,
      }
    },
    disableManagedApiKey: (configuratorId) => {
      keyDisables.push(configuratorId)
    },
    proxyPort: () => identity.proxyPort,
  }
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-host-runtime-"))
  targetPath = path.join(directory, "settings.json")
  fs.writeFileSync(targetPath, `${JSON.stringify({ env: { KEEP: "yes" } })}\n`)
  keyWrites = []
  keyDisables = []
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe("configurator host runtime", () => {
  test("each built-in target finds its fixture installation without changing client settings", async () => {
    const overrides = dependencies(runtime("one"))
    const desktopPaths = overrides.claudeDesktopPaths?.()
    if (!desktopPaths) throw new Error("Expected Claude Desktop paths")

    const claudeCodeBin = path.join(directory, "installs", "claude-code")
    const copilotCliBin = path.join(directory, "installs", "copilot-cli")
    const desktopHome = path.join(directory, "installs", "desktop-home")
    const localAppData = path.join(desktopHome, "AppData", "Local")
    fs.mkdirSync(claudeCodeBin, { recursive: true })
    fs.mkdirSync(copilotCliBin, { recursive: true })
    fs.mkdirSync(path.join(localAppData, "AnthropicClaude"), {
      recursive: true,
    })
    fs.writeFileSync(path.join(claudeCodeBin, "claude"), "fixture")
    fs.writeFileSync(path.join(copilotCliBin, "copilot"), "fixture")

    const copilotSettingsPath = path.join(directory, "copilot-settings.json")
    fs.mkdirSync(path.dirname(desktopPaths.anchorPath), { recursive: true })
    fs.writeFileSync(desktopPaths.anchorPath, '{"keep":"desktop"}\n')
    fs.writeFileSync(copilotSettingsPath, '{"keep":"copilot"}\n')
    const settingsPaths = [
      targetPath,
      desktopPaths.anchorPath,
      copilotSettingsPath,
    ]
    const snapshotSettings = () =>
      settingsPaths.map((filePath) => ({
        filePath,
        contents: fs.readFileSync(filePath, "utf8"),
        modifiedAt: fs.statSync(filePath, { bigint: true }).mtimeNs,
      }))
    const settingsBeforeDiscovery = snapshotSettings()

    const detectorCalls: Array<string> = []
    const host = createConfiguratorHost({
      ...overrides,
      claudeCodeInstalled: () => {
        detectorCalls.push("claude-code")
        return (
          detectClaudeInstalls({
            homeDir: path.join(directory, "empty-claude-home"),
            pathDirs: [claudeCodeBin],
            npmPrefix: null,
            platform: "linux",
            readVersion: () => "fixture",
          }).length > 0
        )
      },
      claudeDesktopInstalled: () => {
        detectorCalls.push("claude-desktop")
        return claudeAppInstalled("win32", desktopHome, localAppData)
      },
      copilotCliInstalled: () => {
        detectorCalls.push("copilot-cli")
        return copilotCliInstalled({
          pathDirs: [copilotCliBin],
          platform: "linux",
        })
      },
    })

    expect(
      await host.targetInstalled(BUILTIN_CONFIGURATOR_TARGETS.claudeCode),
    ).toBe(true)
    expect(
      await host.targetInstalled(BUILTIN_CONFIGURATOR_TARGETS.claudeDesktop),
    ).toBe(true)
    expect(
      await host.targetInstalled(BUILTIN_CONFIGURATOR_TARGETS.copilotCli),
    ).toBe(true)
    expect(detectorCalls).toEqual([
      "claude-code",
      "claude-desktop",
      "copilot-cli",
    ])
    expect(snapshotSettings()).toEqual(settingsBeforeDiscovery)
    expect(fs.existsSync(path.join(directory, ".maximal-configurators"))).toBe(
      false,
    )
  })

  test("a live collision provisions a credential only for the winner", async () => {
    const first = createConfiguratorHost(dependencies(runtime("one")))
    const second = createConfiguratorHost(dependencies(runtime("two")))

    const results = await Promise.all([
      first.connectTarget(metadata, patch),
      second.connectTarget(metadata, patch),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      "connected",
      "owned-by-another-configurator",
    ])
    expect(keyWrites).toHaveLength(1)
    const document = JSON.parse(fs.readFileSync(targetPath, "utf8")) as {
      env: Record<string, string>
    }
    expect(document.env.KEEP).toBe("yes")
    expect(document.env.ANTHROPIC_AUTH_TOKEN).toBe(
      `mxl_${keyWrites[0]}_credential`,
    )
  })

  test("inspection reports the complete owner identity for wire projection", async () => {
    const identity = runtime("one")
    const host = createConfiguratorHost(dependencies(identity))
    await host.connectTarget(metadata, patch)

    const connection = await host.inspectTarget(metadata.id, metadata.targetId)

    expect(connection).toEqual({
      status: "connected",
      allowedActions: ["disconnect"],
      ownership: {
        configuratorId: metadata.id,
        targetPath,
        runtime: identity,
      },
    })
  })

  test("disconnect disables the managed key only for the owning runtime", async () => {
    const owner = createConfiguratorHost(dependencies(runtime("one")))
    const contender = createConfiguratorHost(dependencies(runtime("two")))
    await owner.connectTarget(metadata, patch)

    expect(
      (await contender.disconnectTarget(metadata.id, metadata.targetId)).status,
    ).toBe("owned-by-another-configurator")
    expect(keyDisables).toEqual([])

    expect(
      (await owner.disconnectTarget(metadata.id, metadata.targetId)).status,
    ).toBe("disconnected")
    expect(keyDisables).toEqual(["claude-code"])
  })

  test("Claude Desktop commits its profile set before creating the workspace", async () => {
    const identity = runtime("one")
    const createdDirectories: Array<string> = []
    const overrides = dependencies(identity)
    const desktopPaths = overrides.claudeDesktopPaths?.()
    if (!desktopPaths) throw new Error("Expected Claude Desktop paths")
    const host = createConfiguratorHost({
      ...overrides,
      createDirectory: (target) => {
        createdDirectories.push(target)
        fs.mkdirSync(target, { recursive: true })
      },
    })
    const desktopMetadata: ConfiguratorMetadata = {
      id: "claude-desktop",
      name: "Claude Desktop",
      targetId: "claude-desktop-config-library",
      credentialBinding: {
        kind: "native-field",
        path: ["inferenceGatewayApiKey"],
      },
    }

    const result = await host.connectTarget(desktopMetadata, (material) => ({
      targetId: desktopMetadata.targetId,
      fields: [
        { path: ["inferenceGatewayBaseUrl"], value: material.baseUrl },
        {
          path: ["inferenceGatewayApiKey"],
          value: material.credential ?? "",
        },
      ],
    }))

    expect(result.status).toBe("connected")
    expect(createdDirectories).toEqual([desktopPaths.workspaceDirectory])
    expect(fs.existsSync(desktopPaths.profilePath)).toBe(true)
    expect(fs.existsSync(desktopPaths.metaPath)).toBe(true)
    expect(fs.existsSync(desktopPaths.anchorPath)).toBe(true)
  })
})
