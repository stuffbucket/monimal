import {
  buildSearchSettingsManifest,
  copilotSearchProvider,
  duckDuckGoSearchProvider,
  ollamaSearchProvider,
  type ConnectorSettingField,
  type ConnectorSettingValue,
  type SearchConnectorConfig,
  type SearchProviderConfig,
  type SearchProvider,
} from "@stuffbucket/maximal-harness"
import { randomUUID } from "node:crypto"

import type {
  AppEntry,
  ApiKeyCreateRequest as ApiKeyCreateRequestType,
  ApiKeyEntry,
  ApiKeysListResponse,
  ApiKeyUpdateRequest as ApiKeyUpdateRequestType,
  ConnectionAction,
  ConnectionCredentialReveal,
  ConnectionEntry,
  ConnectionsListResponse,
  CopilotRefreshStatus,
  DiagnosticsResponse,
  SearchProviderValidationRequest,
  SearchProviderValidationResponse,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
} from "~/lib/config/settings-types"
import type {
  ConfiguratorConnection,
  ConfiguratorPlugin,
  ConfiguratorRegistry,
} from "~/lib/configurator-host"
import type { Model } from "~/services/copilot/get-models"

import { getApp } from "~/apps/registry"
import { describeExecutor } from "~/debug"
import { generateApiKeyValue } from "~/lib/auth/api-key-helper"
import {
  copilotBaseUrl,
  getCopilotTokenUrl,
  getEnterpriseDomain,
  getGitHubApiBaseUrl,
} from "~/lib/config/api-config"
import {
  type AppConfig,
  getConfig,
  updateConfig,
  writeConfig,
} from "~/lib/config/config"
import { API_KEY_VALUE_PATTERN } from "~/lib/config/config-schema"
import {
  probeSearchProvider,
  type SearchProviderRequest,
} from "~/lib/config/search-provider-probe"
import {
  enabledProviderError,
  searchSettingError,
} from "~/lib/config/search-setting-validation"
import { SearchSettingsResponse as SearchSettingsResponseSchema } from "~/lib/config/settings-types"
import {
  apiKeyToCredentialSummary,
  configuratorConnectionToAppEntry,
  configuratorConnectionToConnectionEntry,
} from "~/lib/configurator-app-compat"
import { sendProviderRequest } from "~/lib/http/send-request"
import { shouldUseResponsesApi } from "~/lib/models/endpoint-selection"
import { describeLaunchSource } from "~/lib/platform/cli-path"
import {
  copilotRefreshHealth,
  copilotTokenHealth,
  modelsCached,
  state,
  tokenPresence,
} from "~/lib/runtime-state/state"
import { BUILD_VERSION } from "~/lib/update/build-info"
import { getGitVersion, shortSha } from "~/lib/update/version"

export type SettingsOperationErrorKind =
  "conflict" | "not_found" | "validation_error"

export class SettingsOperationError extends Error {
  readonly kind: SettingsOperationErrorKind

  constructor(message: string, kind: SettingsOperationErrorKind) {
    super(message)
    this.name = "SettingsOperationError"
    this.kind = kind
  }
}

const unboundProvider = () => ({})
const baseSearchProviders = [
  ollamaSearchProvider(unboundProvider),
  copilotSearchProvider(unboundProvider),
  duckDuckGoSearchProvider(unboundProvider),
]

function searchProvidersForModels(models: ReadonlyArray<Model>) {
  const modelOptions = models
    .filter(
      (model) => model.model_picker_enabled && shouldUseResponsesApi(model),
    )
    .map((model) => ({ label: model.name || model.id, value: model.id }))
    .sort(
      (left, right) =>
        left.label.localeCompare(right.label)
        || left.value.localeCompare(right.value),
    )
  return [
    ollamaSearchProvider(unboundProvider),
    modelOptions.length === 0 ?
      copilotSearchProvider(unboundProvider)
    : copilotSearchProvider(unboundProvider, modelOptions),
    duckDuckGoSearchProvider(unboundProvider),
  ]
}

interface SearchSettingsDependencies {
  env: NodeJS.ProcessEnv
  getConfig: typeof getConfig
  getModels: () => ReadonlyArray<Model>
  writeConfig: typeof writeConfig
}

const searchSettingsDependencies: SearchSettingsDependencies = {
  env: process.env,
  getConfig,
  getModels: () => state.models?.data ?? [],
  writeConfig,
}

export function buildSearchSettings(
  config: AppConfig = getConfig(),
  env: NodeJS.ProcessEnv = process.env,
  models: ReadonlyArray<Model> = state.models?.data ?? [],
): SearchSettingsResponse {
  const searchProviders = searchProvidersForModels(models)
  const searchManifest = buildSearchSettingsManifest(searchProviders)
  const search = config.connectors?.search ?? {}
  const defaults = search.defaults ?? {}
  const settings: Record<string, ConnectorSettingValue> = {
    priority: [...(search.priority ?? searchProviders.map(({ id }) => id))],
    fallback: search.fallback ?? true,
    maxResults: defaults.maxResults ?? 5,
    allowedDomains: [...(defaults.allowedDomains ?? [])],
    blockedDomains: [...(defaults.blockedDomains ?? [])],
  }
  const providers = Object.fromEntries(
    searchProviders.map((provider) => {
      const configured = search.providers?.[provider.id]
      const configuredSettings = Object.fromEntries(
        Object.entries(configured?.settings ?? {}).filter(
          (entry): entry is [string, ConnectorSettingValue] =>
            entry[1] !== undefined,
        ),
      )
      const secretSources: Record<string, "environment" | "settings"> = {}
      const secretKeys = new Set<string>()
      for (const field of provider.settings ?? []) {
        if (field.type !== "secret") continue
        secretKeys.add(field.key)
        if (typeof configuredSettings[field.key] === "string") {
          secretSources[field.key] = "settings"
        } else if (provider.id === "ollama" && env.OLLAMA_API_KEY) {
          secretSources[field.key] = "environment"
        }
      }
      const providerSettings = Object.fromEntries(
        Object.entries(configuredSettings).filter(
          ([key]) => !secretKeys.has(key),
        ),
      )
      return [
        provider.id,
        {
          enabled:
            (configured?.enabled ?? true)
            && enabledProviderError(provider, configured?.settings, env)
              === undefined,
          settings: providerSettings,
          secret_sources: secretSources,
        },
      ]
    }),
  )
  return SearchSettingsResponseSchema.parse({
    manifest: searchManifest,
    settings,
    providers,
  })
}

export function updateSearchSettings(
  input: SearchSettingsUpdateRequest,
  dependencies: SearchSettingsDependencies = searchSettingsDependencies,
): SearchSettingsResponse {
  const current = dependencies.getConfig()
  const searchProviders = searchProvidersForModels(dependencies.getModels())
  const searchManifest = buildSearchSettingsManifest(searchProviders)
  const previous = current.connectors?.search ?? {}
  const global = mergeGlobalSearchSettings(
    previous,
    input.settings,
    searchManifest.fields,
  )
  const providers = mergeSearchProviders(previous.providers, input.providers, {
    searchProviders,
    env: dependencies.env,
  })
  const nextSearch = { ...previous, ...global, providers }
  const saved = dependencies.writeConfig({
    ...current,
    connectors: { ...current.connectors, search: nextSearch },
  })
  return buildSearchSettings(saved, dependencies.env, dependencies.getModels())
}

interface SearchProviderValidationDependencies {
  env: NodeJS.ProcessEnv
  request: SearchProviderRequest
  getConfig: typeof getConfig
  getModels: () => ReadonlyArray<Model>
}

const searchProviderValidationDependencies: SearchProviderValidationDependencies =
  {
    env: process.env,
    request: sendProviderRequest,
    getConfig,
    getModels: () => state.models?.data ?? [],
  }

export async function validateSearchProvider(
  input: SearchProviderValidationRequest,
  dependencies: SearchProviderValidationDependencies = searchProviderValidationDependencies,
): Promise<SearchProviderValidationResponse> {
  const provider = searchProvidersForModels(dependencies.getModels()).find(
    ({ id }) => id === input.providerId,
  )
  if (!provider)
    invalidSearchSetting(`Unknown search provider: ${input.providerId}`)

  const configured =
    dependencies.getConfig().connectors?.search?.providers?.[provider.id]
  const settings = mergeProviderSettings(
    provider,
    configured?.settings,
    input.settings,
  )
  validateEnabledProvider(provider, settings, dependencies.env)
  return probeSearchProvider({
    provider,
    settings,
    env: dependencies.env,
    request: dependencies.request,
  })
}

function mergeGlobalSearchSettings(
  previous: SearchConnectorConfig,
  updates: SearchSettingsUpdateRequest["settings"],
  fields: ReadonlyArray<ConnectorSettingField>,
): Pick<SearchConnectorConfig, "priority" | "fallback" | "defaults"> {
  let priority = previous.priority
  let fallback = previous.fallback
  const defaults = { ...previous.defaults }
  for (const [key, value] of Object.entries(updates ?? {})) {
    const field = fields.find((candidate) => candidate.key === key)
    if (!field) invalidSearchSetting(`Unknown search setting: ${key}`)
    validateSetting(field, value, `search.${key}`)
    if (key === "priority" && Array.isArray(value)) {
      validatePriority(value)
      priority = value
    } else if (key === "fallback" && typeof value === "boolean") {
      fallback = value
    } else if (key === "maxResults" && typeof value === "number") {
      defaults.maxResults = value
    } else if (key === "allowedDomains" && Array.isArray(value)) {
      defaults.allowedDomains = value
    } else if (key === "blockedDomains" && Array.isArray(value)) {
      defaults.blockedDomains = value
    }
  }
  return { priority, fallback, defaults }
}

function validatePriority(priority: Array<string>): void {
  const known = new Set(baseSearchProviders.map(({ id }) => id))
  if (new Set(priority).size !== priority.length)
    invalidSearchSetting("Search provider priority contains duplicates")
  const unknown = priority.find((id) => !known.has(id))
  if (unknown) invalidSearchSetting(`Unknown search provider: ${unknown}`)
}

function mergeSearchProviders(
  previous: SearchConnectorConfig["providers"],
  updates: SearchSettingsUpdateRequest["providers"],
  validation: {
    searchProviders: ReadonlyArray<SearchProvider>
    env: NodeJS.ProcessEnv
  },
): Record<string, SearchProviderConfig> {
  const providers = { ...previous }
  for (const [providerId, update] of Object.entries(updates ?? {})) {
    const provider = validation.searchProviders.find(
      ({ id }) => id === providerId,
    )
    if (!provider)
      invalidSearchSetting(`Unknown search provider: ${providerId}`)
    const configured = providers[providerId] ?? {}
    const settings = mergeProviderSettings(
      provider,
      configured.settings,
      update.settings,
    )
    const enabled = update.enabled ?? configured.enabled ?? true
    if (enabled) validateEnabledProvider(provider, settings, validation.env)
    providers[providerId] =
      update.enabled === undefined ?
        { ...configured, settings }
      : { ...configured, enabled: update.enabled, settings }
  }
  return providers
}

function mergeProviderSettings(
  provider: SearchProvider,
  previous: SearchProviderConfig["settings"],
  updates: NonNullable<
    SearchSettingsUpdateRequest["providers"]
  >[string]["settings"],
): Record<string, ConnectorSettingValue | undefined> {
  let settings = { ...previous }
  for (const [key, value] of Object.entries(updates ?? {})) {
    const field = provider.settings?.find((candidate) => candidate.key === key)
    if (!field) invalidSearchSetting(`Unknown ${provider.id} setting: ${key}`)
    if ((field.type === "secret" && value === "") || value === null) {
      settings = Object.fromEntries(
        Object.entries(settings).filter(([candidate]) => candidate !== key),
      )
      continue
    }
    validateSetting(field, value, `${provider.id}.${key}`)
    settings[key] = value
  }
  return settings
}

function validateSetting(
  field: ConnectorSettingField,
  value: ConnectorSettingValue | null,
  path: string,
): void {
  const error = searchSettingError(field, value, path)
  if (error !== undefined) invalidSearchSetting(error)
}

function validateEnabledProvider(
  provider: SearchProvider,
  settings: SearchProviderConfig["settings"],
  env: NodeJS.ProcessEnv,
): void {
  const error = enabledProviderError(provider, settings, env)
  if (error !== undefined) invalidSearchSetting(error)
}

function invalidSearchSetting(message: string): never {
  throw new SettingsOperationError(message, "validation_error")
}

export function listApiKeys(): ApiKeysListResponse {
  const config = getConfig()
  return {
    entries: config.auth?.apiKeyEntries ?? [],
    enforcing: config.auth?.enforce === true,
  }
}

export async function listConnections(
  registry?: ConfiguratorRegistry,
): Promise<ConnectionsListResponse> {
  const config = getConfig()
  const credentials = config.auth?.apiKeyEntries ?? []
  const clients = await Promise.all(
    (registry?.all() ?? []).map(async (plugin) => {
      const credential = credentials.find(
        (entry) =>
          entry.kind === "managed"
          && entry.configurator_id === plugin.metadata.id,
      )
      return configuratorConnectionToConnectionEntry(
        plugin,
        await plugin.connection(),
        credential,
      )
    }),
  )
  return {
    clients,
    manual_credentials: credentials
      .filter((entry) => entry.kind !== "managed")
      .map((entry) => apiKeyToCredentialSummary(entry)),
    require_known_keys: config.auth?.enforce === true,
  }
}

export function revealConnectionCredential(
  id: string,
): ConnectionCredentialReveal {
  const entry = getConfig().auth?.apiKeyEntries?.find(
    (candidate) => candidate.id === id,
  )
  if (!entry) {
    throw new SettingsOperationError(
      "Connection credential not found",
      "not_found",
    )
  }
  return { id: entry.id, key: entry.key }
}

function validApiKey(candidate: string): string {
  const key = candidate.trim()
  if (key === "*" || !API_KEY_VALUE_PATTERN.test(key)) {
    throw new SettingsOperationError(
      "Key must be 8–128 chars of letters, digits, underscore, or hyphen.",
      "validation_error",
    )
  }
  return key
}

export function createApiKey(input: ApiKeyCreateRequestType): ApiKeyEntry {
  const key = validApiKey(input.key ?? generateApiKeyValue())
  const entry: ApiKeyEntry = {
    id: randomUUID(),
    label: input.label.trim(),
    key,
    enabled: input.enabled ?? true,
    created_at: new Date().toISOString(),
    kind: "manual",
  }
  updateConfig((config) => {
    const entries = config.auth?.apiKeyEntries ?? []
    if (entries.some((candidate) => candidate.key === key)) {
      throw new SettingsOperationError("Key already exists", "conflict")
    }
    return {
      ...config,
      auth: { ...config.auth, apiKeyEntries: [...entries, entry] },
    }
  })
  return entry
}

export function updateApiKey(
  id: string,
  input: ApiKeyUpdateRequestType,
): ApiKeyEntry {
  let updated: ApiKeyEntry | undefined
  updateConfig((config) => {
    const entries = config.auth?.apiKeyEntries ?? []
    const index = entries.findIndex((entry) => entry.id === id)
    if (index === -1) {
      throw new SettingsOperationError("API key not found", "not_found")
    }
    const current = entries[index]
    if (
      current.kind === "managed"
      && (input.label !== undefined
        || input.key !== undefined
        || input.enabled !== undefined)
    ) {
      throw new SettingsOperationError(
        "Managed API keys are controlled by their connection",
        "validation_error",
      )
    }
    const key = input.key === undefined ? current.key : validApiKey(input.key)
    if (
      entries.some(
        (entry, entryIndex) => entryIndex !== index && entry.key === key,
      )
    ) {
      throw new SettingsOperationError("Key already exists", "conflict")
    }
    updated = {
      ...current,
      label: input.label?.trim() ?? current.label,
      key,
      enabled: input.enabled ?? current.enabled,
    }
    const next = [...entries]
    next[index] = updated
    return { ...config, auth: { ...config.auth, apiKeyEntries: next } }
  })
  if (!updated) throw new Error("API key update did not produce a value")
  return updated
}

export function removeApiKey(id: string): void {
  updateConfig((config) => {
    const entries = config.auth?.apiKeyEntries ?? []
    const entry = entries.find((candidate) => candidate.id === id)
    if (!entry) {
      throw new SettingsOperationError("API key not found", "not_found")
    }
    if (entry.kind === "managed") {
      throw new SettingsOperationError(
        "Managed API keys are controlled by their connection",
        "validation_error",
      )
    }
    const next = entries.filter((candidate) => candidate.id !== id)
    return { ...config, auth: { ...config.auth, apiKeyEntries: next } }
  })
}

export function setApiKeyEnforcement(enforcing: boolean): ApiKeysListResponse {
  const config = updateConfig((current) => ({
    ...current,
    auth: { ...current.auth, enforce: enforcing },
  }))
  return {
    entries: config.auth?.apiKeyEntries ?? [],
    enforcing: config.auth?.enforce === true,
  }
}

interface AppOperationDependencies {
  getApp: typeof getApp
  getConfig: typeof getConfig
  writeConfig: typeof writeConfig
  updateConfig?: typeof updateConfig
}

const appOperationDependencies: AppOperationDependencies = {
  getApp,
  getConfig,
  writeConfig,
  updateConfig,
}

export async function setAppEnabled(
  appId: AppEntry["id"],
  enabled: boolean,
  dependencies: AppOperationDependencies = appOperationDependencies,
): Promise<AppEntry> {
  const app = dependencies.getApp(appId)
  if (!app || app.kind === "coming-soon") {
    throw new SettingsOperationError(
      "App cannot be configured",
      "validation_error",
    )
  }
  if (enabled && !(await app.detect())) {
    throw new SettingsOperationError(
      `No ${app.name} install detected.`,
      "conflict",
    )
  }
  let conflict: AppEntry["conflict"] = null
  if (enabled) {
    const result = await app.enable()
    conflict = result.conflict ?? null
  } else {
    await app.disable()
  }
  if (appId === "claude-desktop") {
    const applyIntent = (config: ReturnType<typeof getConfig>) => ({
      ...config,
      apps: {
        ...config.apps,
        claudeDesktop: {
          ...config.apps?.claudeDesktop,
          enabled,
        },
      },
    })
    if (dependencies.updateConfig) {
      dependencies.updateConfig(applyIntent)
    } else {
      dependencies.writeConfig(applyIntent(dependencies.getConfig()))
    }
  }
  return app.getDetails(conflict)
}

function configuratorIntentKey(
  configuratorId: string,
): "claudeCode" | "claudeDesktop" | undefined {
  if (configuratorId === "claude-code") return "claudeCode"
  if (configuratorId === "claude-desktop") return "claudeDesktop"
  return undefined
}

function persistConfiguratorIntent(
  configuratorId: string,
  enabled: boolean | undefined,
): boolean | undefined {
  const configKey = configuratorIntentKey(configuratorId)
  if (!configKey) return undefined
  let previous: boolean | undefined
  updateConfig((config) => {
    previous = config.apps?.[configKey]?.enabled
    return {
      ...config,
      apps: {
        ...config.apps,
        [configKey]: {
          ...config.apps?.[configKey],
          enabled,
        },
      },
    }
  })
  return previous
}

function invokeConnectionAction(
  plugin: ConfiguratorPlugin,
  action: ConnectionAction,
): Promise<ConfiguratorConnection> {
  if (action === "connect") return plugin.connect()
  if (action === "reconnect") return plugin.reconnect()
  return plugin.disconnect()
}

async function applyConnectionAction(
  registry: ConfiguratorRegistry,
  configuratorId: string,
  action: ConnectionAction,
): Promise<{
  plugin: ConfiguratorPlugin
  connection: ConfiguratorConnection
}> {
  const plugin = registry.get(configuratorId)
  if (!plugin || plugin.metadata.availability === "coming-soon") {
    throw new SettingsOperationError(
      "Connection cannot be configured",
      "validation_error",
    )
  }

  const connecting = action === "connect" || action === "reconnect"
  // Connection intent is write-ahead: if the daemon stops after enabling a
  // managed credential but before committing the target claim, boot
  // reconciliation safely retries the same desired connection. Disconnect
  // keeps the previous true intent until target restoration and credential
  // disable both succeed.
  const previousIntent =
    connecting ? persistConfiguratorIntent(configuratorId, true) : undefined
  // A thrown connect or reconnect can occur after the managed credential was
  // durably enabled but before the target journal was committed. Keep the true
  // intent in that case. Structured refusals occur before writes and may safely
  // restore the prior intent below.
  const connection = await invokeConnectionAction(plugin, action)
  const succeeded =
    connecting ?
      connection.status === "connected"
    : connection.status === "available" || connection.status === "not-installed"
  if (!succeeded) {
    if (connecting) persistConfiguratorIntent(configuratorId, previousIntent)
    const detail = connection.detail ?? connection.status.replaceAll("-", " ")
    throw new SettingsOperationError(
      `Cannot ${action} ${plugin.metadata.name}: ${detail}.`,
      "conflict",
    )
  }

  if (action === "disconnect") persistConfiguratorIntent(configuratorId, false)
  return { plugin, connection }
}

export async function actOnConnection(
  registry: ConfiguratorRegistry,
  configuratorId: string,
  action: ConnectionAction,
): Promise<ConnectionEntry> {
  const { plugin, connection } = await applyConnectionAction(
    registry,
    configuratorId,
    action,
  )
  const credential = getConfig().auth?.apiKeyEntries?.find(
    (entry) =>
      entry.kind === "managed" && entry.configurator_id === plugin.metadata.id,
  )
  return configuratorConnectionToConnectionEntry(plugin, connection, credential)
}

export async function setConfiguratorEnabled(
  registry: ConfiguratorRegistry,
  appId: AppEntry["id"],
  enabled: boolean,
): Promise<AppEntry> {
  const { plugin, connection } = await applyConnectionAction(
    registry,
    appId,
    enabled ? "connect" : "disconnect",
  )
  const entry = configuratorConnectionToAppEntry(plugin, connection)
  if (!entry) {
    throw new SettingsOperationError(
      "App cannot be configured",
      "validation_error",
    )
  }
  return entry
}

const isoOrNull = (ms: number | null | undefined): string | null =>
  ms === null || ms === undefined ? null : new Date(ms).toISOString()

function buildCopilotRefreshStatus(): CopilotRefreshStatus {
  const health = copilotRefreshHealth()
  return {
    health: copilotTokenHealth(),
    token_expires_at: isoOrNull(state.copilotTokenExpiresAtMs),
    last_success_at: isoOrNull(health.lastSuccessAtMs),
    last_failure_at: isoOrNull(health.lastFailureAtMs),
    last_failure_reason: health.lastFailureReason,
    consecutive_failures: health.consecutiveFailures,
  }
}

export function buildDiagnostics(): DiagnosticsResponse {
  const git = getGitVersion()
  const launch = describeLaunchSource()
  const tokens = tokenPresence()
  const executor = describeExecutor(process.env, getConfig())
  return {
    version: BUILD_VERSION,
    source_revision: git.sha ? shortSha(git.sha) : null,
    source_branch: git.branch ?? null,
    launch_path: launch.path,
    launch_kind: launch.kind,
    pid: process.pid,
    uptime_ms: Math.round(process.uptime() * 1000),
    account_type: state.accountType,
    models_cached: modelsCached(),
    tokens: {
      github_token_present: tokens.github,
      copilot_token_present: tokens.copilot,
    },
    copilot_refresh: buildCopilotRefreshStatus(),
    rate_limit: {
      interval_seconds: state.rateLimitSeconds ?? null,
      last_request_at:
        state.lastRequestTimestamp ?
          new Date(state.lastRequestTimestamp).toISOString()
        : null,
      wait_when_throttled: state.rateLimitWait,
    },
    web_search: {
      kind: executor.web_tools,
      detail: executor.base ?? executor.notes ?? null,
    },
    copilot_service: {
      upstream_host: copilotBaseUrl(state),
      github_api_base_url: getGitHubApiBaseUrl(),
      token_endpoint: getCopilotTokenUrl(),
      enterprise_domain: getEnterpriseDomain(),
      discovered_upstream: state.copilotApiUrl ?? null,
    },
  }
}
