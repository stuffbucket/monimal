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

interface SettingFieldBase {
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly required?: boolean
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
  /** Continue after transient provider failures. Defaults to true. */
  readonly fallback?: boolean
  readonly providers?: Readonly<Record<string, SearchProviderConfig>>
  readonly defaults?: SearchOptions
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

export function createSearchConnector(
  providers: ReadonlyArray<SearchProvider>,
  config: SearchConnectorConfig = {},
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
  const instances = new Map<string, SearchProviderInstance>()

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
        instance = provider.create(providerConfig?.settings ?? {})
        instances.set(id, instance)
      }
      return [instance]
    })

  return {
    providers: () => providers,
    search: async (query, options = {}) => {
      const effectiveOptions = mergeSearchOptions(config.defaults, options)
      let lastFailure: SearchResult = { ok: false, code: "unavailable" }
      for (const provider of candidates("search")) {
        if (!(await isAvailable(provider)) || !provider.search) continue
        const result = await provider.search(query, effectiveOptions)
        if (result.ok) return applyDomainPolicy(result, effectiveOptions)
        lastFailure = result
        if (!fallback || !TRANSIENT_ERRORS.has(result.code)) return result
      }
      return lastFailure
    },
    fetch: async (url, options = {}) => {
      let lastFailure: FetchResult = { ok: false, code: "unavailable" }
      for (const provider of candidates("fetch")) {
        if (!(await isAvailable(provider)) || !provider.fetch) continue
        const result = await provider.fetch(url, options)
        if (result.ok) return result
        lastFailure = result
        if (!fallback || !TRANSIENT_ERRORS.has(result.code)) return result
      }
      return lastFailure
    },
  }
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
