import type {
  ApiKeyEntry,
  AppEntry,
  AppsListResponse,
  ConnectionCredentialSummary,
  ConnectionEntry,
} from "~/lib/config/settings-types"
import type {
  ConfiguratorConnection,
  ConfiguratorPlugin,
  ConfiguratorRegistry,
} from "~/lib/configurator-host"

const compatibilityAppIds = new Set<AppEntry["id"]>([
  "claude-code",
  "claude-desktop",
  "copilot-cli",
])

function compatibilityAppId(id: string): AppEntry["id"] | undefined {
  return compatibilityAppIds.has(id as AppEntry["id"]) ?
      (id as AppEntry["id"])
    : undefined
}

export function apiKeyToCredentialSummary(
  entry: ApiKeyEntry,
): ConnectionCredentialSummary {
  return {
    id: entry.id,
    label: entry.label,
    kind: entry.kind ?? "manual",
    enabled: entry.enabled,
  }
}

export function configuratorConnectionToConnectionEntry(
  plugin: ConfiguratorPlugin,
  connection: ConfiguratorConnection,
  credential: ApiKeyEntry | undefined,
): ConnectionEntry {
  const ownership = connection.ownership
  return {
    id: plugin.metadata.id,
    name: plugin.metadata.name,
    status: connection.status,
    allowed_actions: [...connection.allowedActions],
    detail: connection.detail ?? null,
    credential: credential ? apiKeyToCredentialSummary(credential) : null,
    ownership:
      ownership ?
        {
          configurator_id: ownership.configuratorId,
          target_path: ownership.targetPath,
          pid: ownership.runtime.pid,
          started_at: ownership.runtime.startedAt,
        }
      : null,
    recovery:
      connection.recovery ?
        {
          preserved_paths: connection.recovery.preservedPaths.map(
            (fieldPath) => [...fieldPath],
          ),
        }
      : null,
  }
}

function appStatus(connection: ConfiguratorConnection): AppEntry["status"] {
  if (connection.status === "coming-soon") return "coming-soon"
  if (connection.status === "not-installed") return "not-installed"
  return "ready"
}

export function configuratorConnectionToAppEntry(
  plugin: ConfiguratorPlugin,
  connection: ConfiguratorConnection,
): AppEntry | undefined {
  const id = compatibilityAppId(plugin.metadata.id)
  if (!id) return undefined

  return {
    id,
    name: plugin.metadata.name,
    kind:
      plugin.metadata.availability === "coming-soon" ? "coming-soon" : "config",
    enabled: connection.status === "connected",
    status: appStatus(connection),
    installs: [],
    install: null,
    conflict: null,
  }
}

export async function buildConfiguratorAppsList(
  registry: ConfiguratorRegistry,
): Promise<AppsListResponse> {
  const entries = await Promise.all(
    registry
      .all()
      .map(async (plugin) =>
        configuratorConnectionToAppEntry(plugin, await plugin.connection()),
      ),
  )
  return { apps: entries.filter((entry) => entry !== undefined) }
}
