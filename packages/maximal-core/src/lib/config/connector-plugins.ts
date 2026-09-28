import {
  parsePluginSettings,
  pluginSettingsIssues,
  PluginSettingsError,
  type PluginSettingsIssue,
  type PluginSettingsSchema,
} from "@maximal/maximal-settings"

export type ConnectorConfigIssue = PluginSettingsIssue
export type ConnectorConfigSchema<T> = PluginSettingsSchema<T>

export interface ConnectorPlugin<TConfig = unknown> {
  readonly id: string
  readonly Config: ConnectorConfigSchema<TConfig>
}

export type ConnectorPluginFactory = () =>
  Promise<ReadonlyArray<ConnectorPlugin>> | ReadonlyArray<ConnectorPlugin>

const installed = new Map<string, ConnectorPlugin>()

export class ConnectorConfigError extends PluginSettingsError {
  constructor(pluginId: string, issues: ReadonlyArray<ConnectorConfigIssue>) {
    super(pluginId, issues)
    this.name = "ConnectorConfigError"
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
  try {
    return parsePluginSettings(
      { id: plugin.id, schema: plugin.Config },
      connectors,
    )
  } catch (error) {
    if (error instanceof PluginSettingsError) {
      throw new ConnectorConfigError(error.pluginId, error.issues)
    }
    throw error
  }
}

export function connectorConfigIssues(
  connectors: Readonly<Record<string, unknown>> | undefined,
): ReadonlyArray<ConnectorConfigIssue> {
  return pluginSettingsIssues(
    Array.from(installed.values(), ({ id, Config: schema }) => ({
      id,
      schema,
    })),
    connectors,
    ["connectors"],
  )
}
