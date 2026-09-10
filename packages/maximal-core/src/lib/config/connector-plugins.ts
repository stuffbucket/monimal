export interface ConnectorConfigIssue {
  readonly path?: ReadonlyArray<PropertyKey>
  readonly message: string
}

export interface ConnectorConfigSchema<T> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    validate(
      value: unknown,
    ):
      | { readonly value: T }
      | { readonly issues: ReadonlyArray<ConnectorConfigIssue> }
  }
}

export interface ConnectorPlugin<TConfig = unknown> {
  readonly id: string
  readonly Config: ConnectorConfigSchema<TConfig>
}

export type ConnectorPluginFactory = () =>
  Promise<ReadonlyArray<ConnectorPlugin>> | ReadonlyArray<ConnectorPlugin>

const installed = new Map<string, ConnectorPlugin>()

export class ConnectorConfigError extends Error {
  readonly pluginId: string
  readonly issues: ReadonlyArray<ConnectorConfigIssue>

  constructor(pluginId: string, issues: ReadonlyArray<ConnectorConfigIssue>) {
    super(
      issues
        .map((issue) => {
          const path = issue.path?.map(String).join(".")
          return `${pluginId}${path ? `.${path}` : ""}: ${issue.message}`
        })
        .join("\n"),
    )
    this.name = "ConnectorConfigError"
    this.pluginId = pluginId
    this.issues = issues
  }
}

/** Install the host-owned connector set before Core reads configuration. */
export function installConnectorPlugins(
  plugins: ReadonlyArray<ConnectorPlugin>,
): void {
  installed.clear()
  for (const plugin of plugins) {
    if (installed.has(plugin.id)) {
      throw new Error(`Duplicate connector plugin id: ${plugin.id}`)
    }
    installed.set(plugin.id, plugin)
  }
}

export function connectorPlugin<TPlugin extends ConnectorPlugin>(
  id: string,
  matches: (plugin: ConnectorPlugin) => plugin is TPlugin,
): TPlugin | undefined {
  const plugin = installed.get(id)
  return plugin && matches(plugin) ? plugin : undefined
}

export function parseConnectorConfig<TConfig>(
  plugin: ConnectorPlugin<TConfig>,
  connectors: Readonly<Record<string, unknown>> | undefined,
): TConfig {
  const result = plugin.Config["~standard"].validate(connectors?.[plugin.id])
  if ("issues" in result) {
    throw new ConnectorConfigError(plugin.id, result.issues)
  }
  return result.value
}

export function connectorConfigIssues(
  connectors: Readonly<Record<string, unknown>> | undefined,
): ReadonlyArray<ConnectorConfigIssue> {
  const issues: Array<ConnectorConfigIssue> = []
  for (const plugin of installed.values()) {
    const result = plugin.Config["~standard"].validate(connectors?.[plugin.id])
    if (!("issues" in result)) continue
    for (const issue of result.issues) {
      issues.push({
        path: ["connectors", plugin.id, ...(issue.path ?? [])],
        message: issue.message,
      })
    }
  }
  return issues
}
