import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type {
  ConfiguratorConnection,
  ConfiguratorConnectionMaterial,
  ConfiguratorHost,
  ConfiguratorMetadata,
  ConfiguratorPatchFactory,
} from "~/lib/configurator-host"
import type {
  InspectTargetResult,
  JsonObject,
  ManagedFieldPatch,
  TargetClaim,
} from "~/lib/host-config/types"

import {
  disableManagedApiKey,
  ensureManagedApiKey,
} from "~/lib/auth/api-key-helper"
import { detectClaudeInstalls } from "~/lib/configurator-effects/claude-code-detect"
import { getClaudeCodeSettingsPath } from "~/lib/configurator-effects/claude-code-path"
import { claudeAppInstalled } from "~/lib/configurator-effects/claude-desktop-detect"
import { getClaude3pDir } from "~/lib/configurator-effects/claude-desktop-path"
import { copilotCliInstalled } from "~/lib/configurator-effects/copilot-cli-detect"
import { BUILTIN_CONFIGURATOR_TARGETS } from "~/lib/configurator-host"
import {
  connectJsonResourceSet,
  disconnectJsonResourceSet,
  inspectJsonResourceSet,
  reconnectJsonResourceSet,
  type JsonResourcePatch,
} from "~/lib/host-config/json-resource-set"
import {
  connectJsonTarget,
  disconnectJsonTarget,
  inspectJsonTarget,
  reconnectJsonTarget,
} from "~/lib/host-config/json-target"
import {
  currentRuntimeIdentity,
  probeRuntimeIdentity,
} from "~/lib/host-config/runtime-identity"
import { state } from "~/lib/runtime-state/state"

const CLAUDE_CODE_TARGET = BUILTIN_CONFIGURATOR_TARGETS.claudeCode
const CLAUDE_DESKTOP_TARGET = BUILTIN_CONFIGURATOR_TARGETS.claudeDesktop
const COPILOT_CLI_TARGET = BUILTIN_CONFIGURATOR_TARGETS.copilotCli

function claudeCodeTargetPath(
  targetId: string,
  settingsPath: () => string = getClaudeCodeSettingsPath,
): string {
  if (targetId !== CLAUDE_CODE_TARGET) {
    throw new Error(`Unsupported configurator target: ${targetId}`)
  }
  return settingsPath()
}

function claudeDesktopPaths(): {
  anchorPath: string
  metaPath: string
  profilePath: string
  workspaceDirectory: string
} {
  const directory = getClaude3pDir()
  const libraryDirectory = path.join(directory, "configLibrary")
  const profileId = `maximal-${createHash("sha256")
    .update(path.resolve(directory))
    .digest("hex")
    .slice(0, 24)}`
  return {
    anchorPath: path.join(directory, "claude_desktop_config.json"),
    metaPath: path.join(libraryDirectory, "_meta.json"),
    profilePath: path.join(libraryDirectory, `${profileId}.json`),
    workspaceDirectory: path.join(os.homedir(), "Claude"),
  }
}

type ClaudeDesktopPaths = ReturnType<typeof claudeDesktopPaths>

function desktopResources(
  paths: ClaudeDesktopPaths,
  profileFields: JsonResourcePatch["fields"],
): Array<JsonResourcePatch> {
  const profileId = path.basename(paths.profilePath, ".json")
  return [
    {
      targetPath: paths.profilePath,
      fields: profileFields,
    },
    {
      targetPath: paths.metaPath,
      fields: [{ path: ["appliedId"], value: profileId }],
      arrayEntries: [
        {
          path: ["entries"],
          key: "id",
          keyValue: profileId,
          value: { id: profileId, name: "Maximal" },
        },
      ],
    },
    {
      targetPath: paths.anchorPath,
      fields: [
        { path: ["deploymentMode"], value: "3p" },
        { path: ["preferences", "coworkWebSearchEnabled"], value: true },
      ],
    },
  ]
}

function ownershipFromClaim(
  claim: TargetClaim | undefined,
): ConfiguratorConnection["ownership"] {
  if (!claim) return undefined
  return {
    configuratorId: claim.configuratorId,
    targetPath: claim.targetPath,
    runtime: claim.runtime,
  }
}

function connectionForInspection(
  result: InspectTargetResult,
): ConfiguratorConnection {
  const ownership = ownershipFromClaim(result.claim)
  const details = ownership === undefined ? {} : { ownership }
  switch (result.status) {
    case "available": {
      return { status: result.status, allowedActions: ["connect"], ...details }
    }
    case "connected": {
      return {
        status: result.status,
        allowedActions: ["disconnect"],
        ...details,
      }
    }
    case "changed-externally": {
      return {
        status: result.status,
        allowedActions: ["disconnect", "reconnect"],
        ...details,
      }
    }
    case "owned-by-another-configurator":
    case "recovery-required":
    case "stale-recovery-required": {
      return { status: result.status, allowedActions: [], ...details }
    }
    default: {
      throw new Error("Unsupported target inspection status")
    }
  }
}

export interface ConfiguratorHostRuntimeDependencies {
  claudeCodeInstalled: () => boolean
  claudeDesktopInstalled: () => boolean
  copilotCliInstalled: () => boolean
  claudeCodeSettingsPath: () => string
  claudeDesktopPaths: () => ClaudeDesktopPaths
  currentRuntimeIdentity: typeof currentRuntimeIdentity
  probeRuntimeIdentity: typeof probeRuntimeIdentity
  ensureManagedApiKey: typeof ensureManagedApiKey
  disableManagedApiKey: typeof disableManagedApiKey
  proxyPort: () => number
  createDirectory: (directory: string) => void
}

const defaultDependencies: ConfiguratorHostRuntimeDependencies = {
  claudeCodeInstalled: () => detectClaudeInstalls().length > 0,
  claudeDesktopInstalled: claudeAppInstalled,
  copilotCliInstalled,
  claudeCodeSettingsPath: getClaudeCodeSettingsPath,
  claudeDesktopPaths,
  currentRuntimeIdentity,
  probeRuntimeIdentity,
  ensureManagedApiKey,
  disableManagedApiKey,
  proxyPort: () => state.proxyPort,
  createDirectory: (directory) => {
    fs.mkdirSync(directory, { recursive: true })
  },
}

function connectionMaterial(
  metadata: ConfiguratorMetadata,
  dependencies: ConfiguratorHostRuntimeDependencies,
): ConfiguratorConnectionMaterial {
  const credential =
    metadata.credentialBinding.kind === "none" ?
      undefined
    : dependencies.ensureManagedApiKey(metadata.id, metadata.name).key
  return {
    baseUrl: `http://127.0.0.1:${dependencies.proxyPort()}`,
    ...(credential === undefined ? {} : { credential }),
    ...(metadata.targetId === CLAUDE_DESKTOP_TARGET ?
      {
        workspaceDirectory:
          dependencies.claudeDesktopPaths().workspaceDirectory,
      }
    : {}),
  }
}

function lazyPatchFields(
  metadata: ConfiguratorMetadata,
  factory: ConfiguratorPatchFactory,
  dependencies: ConfiguratorHostRuntimeDependencies,
): (document: JsonObject) => Array<ManagedFieldPatch> {
  let resolved: Array<ManagedFieldPatch> | undefined
  return () => {
    if (resolved) return resolved
    const patch = factory(connectionMaterial(metadata, dependencies))
    if (patch.targetId !== metadata.targetId) {
      throw new Error(
        `Configurator ${metadata.id} returned target ${patch.targetId} for ${metadata.targetId}`,
      )
    }
    resolved = patch.fields.map((field) => ({
      path: [...field.path],
      value: structuredClone(field.value),
    }))
    return resolved
  }
}

function targetInstalled(
  dependencies: ConfiguratorHostRuntimeDependencies,
  targetId: string,
): Promise<boolean> {
  if (targetId === CLAUDE_CODE_TARGET) {
    return Promise.resolve(dependencies.claudeCodeInstalled())
  }
  if (targetId === CLAUDE_DESKTOP_TARGET) {
    return Promise.resolve(dependencies.claudeDesktopInstalled())
  }
  if (targetId === COPILOT_CLI_TARGET) {
    return Promise.resolve(dependencies.copilotCliInstalled())
  }
  return Promise.resolve(false)
}

async function inspectTarget(
  dependencies: ConfiguratorHostRuntimeDependencies,
  configuratorId: string,
  targetId: string,
): Promise<ConfiguratorConnection> {
  const result =
    targetId === CLAUDE_DESKTOP_TARGET ?
      await inspectJsonResourceSet({
        anchorPath: dependencies.claudeDesktopPaths().anchorPath,
        configuratorId,
        runtime: dependencies.currentRuntimeIdentity(),
        probeRuntime: dependencies.probeRuntimeIdentity,
      })
    : await inspectJsonTarget({
        targetPath: claudeCodeTargetPath(
          targetId,
          dependencies.claudeCodeSettingsPath,
        ),
        configuratorId,
        runtime: dependencies.currentRuntimeIdentity(),
        probeRuntime: dependencies.probeRuntimeIdentity,
      })
  return connectionForInspection(result)
}

async function connectTarget(
  dependencies: ConfiguratorHostRuntimeDependencies,
  metadata: ConfiguratorMetadata,
  factory: ConfiguratorPatchFactory,
): ReturnType<ConfiguratorHost["connectTarget"]> {
  const fields = lazyPatchFields(metadata, factory, dependencies)
  if (metadata.targetId !== CLAUDE_DESKTOP_TARGET) {
    return connectJsonTarget({
      targetPath: claudeCodeTargetPath(
        metadata.targetId,
        dependencies.claudeCodeSettingsPath,
      ),
      configuratorId: metadata.id,
      runtime: dependencies.currentRuntimeIdentity(),
      probeRuntime: dependencies.probeRuntimeIdentity,
      fields,
    })
  }
  const paths = dependencies.claudeDesktopPaths()
  const result = await connectJsonResourceSet({
    anchorPath: paths.anchorPath,
    configuratorId: metadata.id,
    runtime: dependencies.currentRuntimeIdentity(),
    probeRuntime: dependencies.probeRuntimeIdentity,
    resources: desktopResources(paths, fields),
  })
  if (result.status === "connected" || result.status === "already-connected") {
    dependencies.createDirectory(paths.workspaceDirectory)
  }
  return result
}

async function reconnectTarget(
  dependencies: ConfiguratorHostRuntimeDependencies,
  metadata: ConfiguratorMetadata,
  factory: ConfiguratorPatchFactory,
): ReturnType<ConfiguratorHost["reconnectTarget"]> {
  const fields = lazyPatchFields(metadata, factory, dependencies)
  if (metadata.targetId !== CLAUDE_DESKTOP_TARGET) {
    return reconnectJsonTarget({
      targetPath: claudeCodeTargetPath(
        metadata.targetId,
        dependencies.claudeCodeSettingsPath,
      ),
      configuratorId: metadata.id,
      runtime: dependencies.currentRuntimeIdentity(),
      probeRuntime: dependencies.probeRuntimeIdentity,
      fields,
    })
  }
  const paths = dependencies.claudeDesktopPaths()
  const result = await reconnectJsonResourceSet({
    anchorPath: paths.anchorPath,
    configuratorId: metadata.id,
    runtime: dependencies.currentRuntimeIdentity(),
    probeRuntime: dependencies.probeRuntimeIdentity,
    resources: desktopResources(paths, fields),
  })
  if (result.status === "connected" || result.status === "already-connected") {
    dependencies.createDirectory(paths.workspaceDirectory)
  }
  return result
}

async function disconnectTarget(
  dependencies: ConfiguratorHostRuntimeDependencies,
  configuratorId: string,
  targetId: string,
): ReturnType<ConfiguratorHost["disconnectTarget"]> {
  const result =
    targetId === CLAUDE_DESKTOP_TARGET ?
      await disconnectJsonResourceSet({
        anchorPath: dependencies.claudeDesktopPaths().anchorPath,
        configuratorId,
        runtime: dependencies.currentRuntimeIdentity(),
      })
    : await disconnectJsonTarget({
        targetPath: claudeCodeTargetPath(
          targetId,
          dependencies.claudeCodeSettingsPath,
        ),
        configuratorId,
        runtime: dependencies.currentRuntimeIdentity(),
      })
  if (result.status === "disconnected" || result.status === "not-connected") {
    dependencies.disableManagedApiKey(configuratorId)
  }
  return result
}

/** Core-owned effects used by statically linked first-party configurators. */
export function createConfiguratorHost(
  overrides: Partial<ConfiguratorHostRuntimeDependencies> = {},
): ConfiguratorHost {
  const dependencies: ConfiguratorHostRuntimeDependencies = {
    ...defaultDependencies,
    ...overrides,
  }
  return {
    targetInstalled: (targetId) => targetInstalled(dependencies, targetId),
    inspectTarget: (configuratorId, targetId) =>
      inspectTarget(dependencies, configuratorId, targetId),
    connectTarget: (metadata, factory) =>
      connectTarget(dependencies, metadata, factory),
    reconnectTarget: (metadata, factory) =>
      reconnectTarget(dependencies, metadata, factory),
    disconnectTarget: (configuratorId, targetId) =>
      disconnectTarget(dependencies, configuratorId, targetId),
  }
}
