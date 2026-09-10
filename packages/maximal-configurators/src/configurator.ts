import type {
  ConfiguratorConnection,
  ConfiguratorConnectionMaterial,
  ConnectTargetResult,
  DisconnectTargetResult,
  ConfiguratorHost,
  ConfiguratorMetadata,
  ConfiguratorPlugin,
  ManagedFieldPatch,
} from "@stuffbucket/maximal-core/configurator-host"

export type ConfiguratorFields = (
  material: ConfiguratorConnectionMaterial,
) => ReadonlyArray<ManagedFieldPatch>

function connected(): ConfiguratorConnection {
  return { status: "connected", allowedActions: ["disconnect"] }
}

function blocked(
  status:
    | "changed-externally"
    | "owned-by-another-configurator"
    | "recovery-required"
    | "stale-recovery-required",
  details: Pick<ConfiguratorConnection, "ownership" | "recovery"> = {},
): ConfiguratorConnection {
  const allowedActions =
    status === "changed-externally" ?
      (["disconnect", "reconnect"] as const)
    : []
  return { status, allowedActions, ...details }
}

function ownershipOf(
  result: ConnectTargetResult,
): ConfiguratorConnection["ownership"] {
  if (!result.claim) return undefined
  return {
    configuratorId: result.claim.configuratorId,
    targetPath: result.claim.targetPath,
    runtime: result.claim.runtime,
  }
}

function connectResult(result: ConnectTargetResult): ConfiguratorConnection {
  const ownership = ownershipOf(result)
  const details = ownership === undefined ? {} : { ownership }
  switch (result.status) {
    case "already-connected":
    case "connected": {
      return { ...connected(), ...details }
    }
    case "changed-externally":
    case "owned-by-another-configurator":
    case "recovery-required":
    case "stale-recovery-required": {
      return blocked(result.status, details)
    }
    default: {
      throw new Error("Unknown configurator result")
    }
  }
}

function disconnectResult(
  result: DisconnectTargetResult,
): ConfiguratorConnection | undefined {
  if (
    result.status !== "owned-by-another-configurator"
    && result.status !== "recovery-required"
  ) {
    return undefined
  }
  return blocked(result.status, {
    recovery: { preservedPaths: result.preservedPaths },
  })
}

function assertMaterial(
  metadata: ConfiguratorMetadata,
  material: ConfiguratorConnectionMaterial,
): void {
  if (material.baseUrl.trim().length === 0) {
    throw new Error(`Configurator ${metadata.id} received an empty base URL`)
  }
  if (
    metadata.credentialBinding.kind !== "none"
    && !material.credential?.trim()
  ) {
    throw new Error(`Configurator ${metadata.id} requires a credential`)
  }
}

export function defineConfigurator(
  metadata: ConfiguratorMetadata,
  fields: ConfiguratorFields,
  host: ConfiguratorHost,
): ConfiguratorPlugin {
  async function availableConnection(): Promise<ConfiguratorConnection> {
    const installed = await host.targetInstalled(metadata.targetId)
    if (metadata.availability === "coming-soon") {
      return { status: "coming-soon", allowedActions: [] }
    }
    if (!installed) {
      return { status: "not-installed", allowedActions: [] }
    }
    return { status: "available", allowedActions: ["connect"] }
  }

  return {
    metadata,

    async connection() {
      const available = await availableConnection()
      if (available.status !== "available") return available
      return host.inspectTarget(metadata.id, metadata.targetId)
    },

    async connect() {
      const available = await availableConnection()
      if (available.status !== "available") return available
      const result = await host.connectTarget(metadata, (material) => {
        assertMaterial(metadata, material)
        return {
          targetId: metadata.targetId,
          fields: fields(material),
        }
      })
      return connectResult(result)
    },

    async reconnect() {
      const available = await availableConnection()
      if (available.status !== "available") return available
      const result = await host.reconnectTarget(metadata, (material) => {
        assertMaterial(metadata, material)
        return {
          targetId: metadata.targetId,
          fields: fields(material),
        }
      })
      return connectResult(result)
    },

    async disconnect() {
      const result = await host.disconnectTarget(metadata.id, metadata.targetId)
      const blockedConnection = disconnectResult(result)
      return blockedConnection ?? availableConnection()
    },

    ...(metadata.availability === "coming-soon" ?
      {}
    : {
        async dispose() {
          await host.disconnectTarget(metadata.id, metadata.targetId)
        },
      }),
  }
}
