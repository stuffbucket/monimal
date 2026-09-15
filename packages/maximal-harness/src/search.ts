export type SearchCapability = "search" | "fetch"

export type SearchErrorCode =
  | "invalid_input"
  | "too_many_requests"
  | "max_uses_exceeded"
  | "query_too_long"
  | "unavailable"

export type FetchErrorCode =
  | "invalid_input"
  | "url_too_long"
  | "url_not_allowed"
  | "url_not_accessible"
  | "too_many_requests"
  | "unsupported_content_type"
  | "max_uses_exceeded"
  | "unavailable"

export interface SearchHit {
  readonly url: string
  readonly title: string
  readonly pageAge?: string | null
}

export type SearchResult =
  | { readonly ok: true; readonly items: ReadonlyArray<SearchHit> }
  | { readonly ok: false; readonly code: SearchErrorCode }

export type FetchResult =
  | {
      readonly ok: true
      readonly markdown: string
      readonly title?: string
    }
  | { readonly ok: false; readonly code: FetchErrorCode }

export interface SearchOptions {
  readonly maxResults?: number
  readonly allowedDomains?: ReadonlyArray<string>
  readonly blockedDomains?: ReadonlyArray<string>
}

export interface FetchOptions {
  readonly maxChars?: number
  readonly timeoutMs?: number
}

export type ConnectorSettingValue =
  boolean | number | string | ReadonlyArray<string>

export type ConnectorSettings = Readonly<
  Record<string, ConnectorSettingValue | undefined>
>

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
    ): { readonly value: T } | { readonly issues: ReadonlyArray<ConnectorConfigIssue> }
  }
}

export interface ConnectorPlugin<TConfig = unknown> {
  readonly id: string
  readonly Config: ConnectorConfigSchema<TConfig>
}

interface SettingFieldBase {
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly helpLink?: {
    readonly label: string
    readonly url: string
  }
  readonly required?: boolean
  readonly format?: "url"
  readonly unit?: "seconds"
  readonly layout?: "full"
  readonly emptyDescription?: string
  readonly validation?: {
    readonly url: {
      readonly protocols: ReadonlyArray<"http:" | "https:">
      readonly pathname: string
    }
    readonly message: string
  }
}

export type ConnectorSettingField =
  | (SettingFieldBase & {
      readonly type: "boolean"
      readonly default?: boolean
    })
  | (SettingFieldBase & {
      readonly type: "integer"
      readonly default?: number
      readonly min?: number
      readonly max?: number
    })
  | (SettingFieldBase & {
      readonly type: "secret" | "string"
      readonly default?: string
      readonly placeholder?: string
    })
  | (SettingFieldBase & {
      readonly type: "string-list"
      readonly default?: ReadonlyArray<string>
    })
  | (SettingFieldBase & {
      readonly type: "select"
      readonly default?: string
      readonly options: ReadonlyArray<{
        readonly label: string
        readonly value: string
      }>
    })

export interface SearchProvider {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly capabilities: ReadonlyArray<SearchCapability>
  readonly settings?: ReadonlyArray<ConnectorSettingField>
  readonly credentialProbe?: {
    readonly secretKey: string
    readonly baseUrlKey: string
    readonly environmentVariable?: string
    readonly path: string
    readonly body: Readonly<Record<string, ConnectorSettingValue>>
  }
  effectiveSetting?(
    key: string,
    configured: ConnectorSettingValue | undefined,
  ): ConnectorSettingValue | undefined
  secretSource?(
    key: string,
    configured: ConnectorSettingValue | undefined,
  ): "environment" | undefined
  create(settings: ConnectorSettings): SearchProviderInstance
}

export interface SearchProviderInstance {
  available?(): boolean | Promise<boolean>
  search?(query: string, options?: SearchOptions): Promise<SearchResult>
  fetch?(url: string, options?: FetchOptions): Promise<FetchResult>
}

export interface SearchProviderConfig {
  readonly enabled?: boolean
  readonly settings?: ConnectorSettings
}

export interface SearchConnectorConfig {
  /** Provider ids in fallback order. Omitted providers are not considered. */
  readonly priority?: ReadonlyArray<string>
  /**
   * Continue after `unavailable` or `too_many_requests`. A failed provider is
   * skipped for 30 seconds, then becomes eligible in its configured order.
   * Defaults to true.
   */
  readonly fallback?: boolean
  readonly providers?: Readonly<Record<string, SearchProviderConfig>>
  readonly defaults?: SearchOptions
}

export interface SearchConnectorPlugin
  extends ConnectorPlugin<SearchConnectorConfig> {
  readonly id: "search"
  providers(): ReadonlyArray<SearchProvider>
}

export function isSearchConnectorPlugin(
  plugin: ConnectorPlugin,
): plugin is SearchConnectorPlugin {
  return (
    plugin.id === "search"
    && "providers" in plugin
    && typeof plugin.providers === "function"
  )
}

const configIssue = (
  path: ReadonlyArray<PropertyKey>,
  message: string,
): { readonly issues: ReadonlyArray<ConnectorConfigIssue> } => ({
  issues: [{ path, message }],
})

function configObject(
  value: unknown,
): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
      (value as Record<string, unknown>)
    : null
}

function settingValue(value: unknown): value is ConnectorSettingValue {
  return (
    typeof value === "boolean"
    || typeof value === "number"
    || typeof value === "string"
    || (Array.isArray(value)
      && value.every((entry) => typeof entry === "string"))
  )
}

/** Standard Schema owned by the Search connector plugin, not by Core config. */
export const SearchConnectorConfigSchema: ConnectorConfigSchema<SearchConnectorConfig> = {
  "~standard": {
    version: 1,
    vendor: "stuffbucket",
    validate(value) {
      if (value === undefined) return { value: {} }
      const root = configObject(value)
      if (root === null) return configIssue([], "Expected an object")

      if (
        root.priority !== undefined
        && (!Array.isArray(root.priority)
          || root.priority.some(
            (entry) => typeof entry !== "string" || entry.length === 0,
          ))
      ) {
        return configIssue(["priority"], "Expected an array of provider ids")
      }
      if (root.fallback !== undefined && typeof root.fallback !== "boolean") {
        return configIssue(["fallback"], "Expected a boolean")
      }

      if (root.defaults !== undefined) {
        const defaults = configObject(root.defaults)
        if (defaults === null)
          return configIssue(["defaults"], "Expected an object")
        if (
          defaults.maxResults !== undefined
          && (typeof defaults.maxResults !== "number"
            || !Number.isInteger(defaults.maxResults)
            || defaults.maxResults < 1
            || defaults.maxResults > 100)
        ) {
          return configIssue(
            ["defaults", "maxResults"],
            "Expected an integer between 1 and 100",
          )
        }
        for (const key of ["allowedDomains", "blockedDomains"] as const) {
          const domains = defaults[key]
          if (
            domains !== undefined
            && (!Array.isArray(domains)
              || domains.some(
                (entry) => typeof entry !== "string" || entry.length === 0,
              ))
          ) {
            return configIssue(
              ["defaults", key],
              "Expected an array of non-empty domains",
            )
          }
        }
      }

      if (root.providers !== undefined) {
        const providers = configObject(root.providers)
        if (providers === null)
          return configIssue(["providers"], "Expected an object")
        for (const [providerId, providerValue] of Object.entries(providers)) {
          const provider = configObject(providerValue)
          if (provider === null) {
            return configIssue(
              ["providers", providerId],
              "Expected an object",
            )
          }
          if (
            provider.enabled !== undefined
            && typeof provider.enabled !== "boolean"
          ) {
            return configIssue(
              ["providers", providerId, "enabled"],
              "Expected a boolean",
            )
          }
          if (provider.settings === undefined) continue
          const settings = configObject(provider.settings)
          if (settings === null) {
            return configIssue(
              ["providers", providerId, "settings"],
              "Expected an object",
            )
          }
          for (const [key, setting] of Object.entries(settings)) {
            if (setting !== undefined && !settingValue(setting)) {
              return configIssue(
                ["providers", providerId, "settings", key],
                "Expected a connector setting value",
              )
            }
          }
        }
      }

      return { value: root }
    },
  },
}

export interface SearchConnectorRuntimeOptions {
  /** How long a transiently failing provider is skipped before priority resumes. */
  readonly transientFailureCooldownMs?: number
  /** Monotonic-enough wall clock used to evaluate cooldowns. */
  readonly now?: () => number
}

export interface SearchConnector {
  search(query: string, options?: SearchOptions): Promise<SearchResult>
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>
  providers(): ReadonlyArray<SearchProvider>
}

const TRANSIENT_ERRORS = new Set<SearchErrorCode | FetchErrorCode>([
  "too_many_requests",
  "unavailable",
])

export const DEFAULT_TRANSIENT_FAILURE_COOLDOWN_MS = 30_000

/** Whether a provider failure is safe to retry through another provider. */
export function isTransientProviderFailure(
  code: SearchErrorCode | FetchErrorCode,
): boolean {
  return TRANSIENT_ERRORS.has(code)
}

export function createSearchConnector(
  providers: ReadonlyArray<SearchProvider>,
  config: SearchConnectorConfig = {},
  runtime: SearchConnectorRuntimeOptions = {},
): SearchConnector {
  const registered = new Map<string, SearchProvider>()
  for (const provider of providers) {
    if (registered.has(provider.id)) {
      throw new Error(`duplicate search provider: ${provider.id}`)
    }
    registered.set(provider.id, provider)
  }

  const priority = config.priority ?? providers.map((provider) => provider.id)
  const fallback = config.fallback ?? true
  const transientFailureCooldownMs = Math.max(
    0,
    runtime.transientFailureCooldownMs ?? DEFAULT_TRANSIENT_FAILURE_COOLDOWN_MS,
  )
  const now = runtime.now ?? Date.now
  const instances = new Map<string, SearchProviderInstance>()
  const retryAfter = new Map<string, number>()

  const coolingDown = (providerId: string): boolean => {
    const deadline = retryAfter.get(providerId)
    if (deadline === undefined) return false
    if (now() < deadline) return true
    retryAfter.delete(providerId)
    return false
  }

  const recordResult = (
    providerId: string,
    result: SearchResult | FetchResult,
  ): void => {
    if (!result.ok && isTransientProviderFailure(result.code)) {
      retryAfter.set(providerId, now() + transientFailureCooldownMs)
    } else {
      retryAfter.delete(providerId)
    }
  }

  const candidates = (capability: SearchCapability) =>
    priority.flatMap((id) => {
      const provider = registered.get(id)
      const providerConfig = config.providers?.[id]
      if (
        !provider
        || providerConfig?.enabled === false
        || !provider.capabilities.includes(capability)
      ) {
        return []
      }
      let instance = instances.get(id)
      if (!instance) {
        instance = provider.create(
          applySettingDefaults(provider.settings, providerConfig?.settings),
        )
        instances.set(id, instance)
      }
      return [{ id, instance }]
    })

  return {
    providers: () => providers,
    search: async (query, options = {}) => {
      const effectiveOptions = mergeSearchOptions(config.defaults, options)
      let lastFailure: SearchResult = { ok: false, code: "unavailable" }
      for (const { id, instance: provider } of candidates("search")) {
        if (fallback && coolingDown(id)) continue
        if (!(await isAvailable(provider)) || !provider.search) continue
        const result = await provider.search(query, effectiveOptions)
        recordResult(id, result)
        if (result.ok) return applyDomainPolicy(result, effectiveOptions)
        lastFailure = result
        if (!fallback || !isTransientProviderFailure(result.code)) return result
      }
      return lastFailure
    },
    fetch: async (url, options = {}) => {
      let lastFailure: FetchResult = { ok: false, code: "unavailable" }
      for (const { id, instance: provider } of candidates("fetch")) {
        if (fallback && coolingDown(id)) continue
        if (!(await isAvailable(provider)) || !provider.fetch) continue
        const result = await provider.fetch(url, options)
        recordResult(id, result)
        if (result.ok) return result
        lastFailure = result
        if (!fallback || !isTransientProviderFailure(result.code)) return result
      }
      return lastFailure
    },
  }
}

function applySettingDefaults(
  fields: ReadonlyArray<ConnectorSettingField> | undefined,
  configured: ConnectorSettings | undefined,
): ConnectorSettings {
  const settings: Record<string, ConnectorSettingValue | undefined> = {
    ...configured,
  }
  for (const field of fields ?? []) {
    if (settings[field.key] === undefined && field.default !== undefined) {
      settings[field.key] = field.default
    }
  }
  return settings
}

async function isAvailable(provider: SearchProviderInstance): Promise<boolean> {
  return provider.available ? provider.available() : true
}

function mergeSearchOptions(
  defaults: SearchOptions | undefined,
  request: SearchOptions,
): SearchOptions {
  const configuredMax = defaults?.maxResults
  const requestedMax = request.maxResults
  let maxResults = requestedMax
  if (configuredMax !== undefined) {
    maxResults =
      requestedMax === undefined ? configuredMax : (
        Math.min(configuredMax, requestedMax)
      )
  }
  const allowedDomains = intersectAllowedDomains(
    defaults?.allowedDomains,
    request.allowedDomains,
  )

  return {
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(allowedDomains === undefined ? {} : { allowedDomains }),
    blockedDomains: [
      ...(defaults?.blockedDomains ?? []),
      ...(request.blockedDomains ?? []),
    ],
  }
}

function intersectAllowedDomains(
  configured: ReadonlyArray<string> | undefined,
  requested: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
  if (!configured?.length) return requested
  if (!requested?.length) return configured

  const intersection = new Set<string>()
  for (const configuredDomain of configured) {
    for (const requestedDomain of requested) {
      const left = normalizeDomain(configuredDomain)
      const right = normalizeDomain(requestedDomain)
      if (!left || !right) continue
      if (domainMatches(left, right)) intersection.add(left)
      else if (domainMatches(right, left)) intersection.add(right)
    }
  }
  return [...intersection]
}

function applyDomainPolicy(
  result: Extract<SearchResult, { ok: true }>,
  options: SearchOptions,
): SearchResult {
  const filtered = result.items.filter((item) => urlAllowed(item.url, options))
  return {
    ok: true,
    items:
      options.maxResults === undefined ?
        filtered
      : filtered.slice(0, options.maxResults),
  }
}

function urlAllowed(url: string, options: SearchOptions): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  const allowed = options.allowedDomains
  if (
    allowed?.length
    && !allowed.some((domain) => domainMatches(hostname, domain))
  ) {
    return false
  }
  return !options.blockedDomains?.some((domain) =>
    domainMatches(hostname, domain),
  )
}

function domainMatches(hostname: string, domain: string): boolean {
  const normalized = normalizeDomain(domain)
  return (
    normalized.length > 0
    && (hostname === normalized || hostname.endsWith(`.${normalized}`))
  )
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replaceAll(/^\.+|\.+$/gu, "")
}
