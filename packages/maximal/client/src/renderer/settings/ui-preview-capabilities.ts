import type {
  AccountsListResponse,
  ConnectorSettingValue,
  MenuBarModeAttempt,
  MenuBarModeState,
  SearchProviderValidationResponse,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  SettingsCapabilities,
} from './capabilities'

const initialAccountsList: AccountsListResponse = {
  accounts: [
    {
      key: 'octocat@github.com',
      login: 'octocat',
      host: 'github.com',
      added_via: 'device-code',
      obtained_at: '2026-09-01T12:00:00Z',
      active: true,
      enabled: true,
    },
    {
      key: 'enterprise-user@ghe.example.com',
      login: 'enterprise-user',
      host: 'ghe.example.com',
      added_via: 'gh-cli',
      obtained_at: '2026-09-02T12:00:00Z',
      active: false,
      enabled: false,
    },
  ],
  active_key: 'octocat@github.com',
}

const initialSearchSettings: SearchSettingsResponse = {
  manifest: {
    id: 'search',
    label: 'Search',
    description: 'Configure search providers for the web and other information sources.',
    fields: [
      {
        key: 'priority',
        type: 'string-list',
        label: 'Provider priority',
        description: 'Provider ids in the order Maximal should try them.',
        default: ['ollama', 'copilot', 'duckduckgo'],
        required: true,
      },
      {
        key: 'fallback',
        type: 'boolean',
        label: 'Fall back after transient failures',
        default: true,
      },
      {
        key: 'allowedDomains',
        type: 'string-list',
        label: 'Allowed domains',
        description: 'Optional global allow-list; subdomains are included.',
      },
      {
        key: 'blockedDomains',
        type: 'string-list',
        label: 'Blocked domains',
        description: 'Global deny-list applied after every provider response.',
      },
    ],
    providers: [
      {
        id: 'ollama',
        label: 'Ollama hosted search',
        description: 'Search and fetch through ollama.com using an API key.',
        capabilities: ['search', 'fetch'],
        settings: [
          {
            key: 'apiKey',
            type: 'secret',
            label: 'API key',
            placeholder: 'Paste your Ollama API key',
            description: 'Use an Ollama API key to authorize hosted search.',
            helpLink: {
              label: 'Create or manage an API key',
              url: 'https://ollama.com/settings/keys',
            },
            required: true,
            layout: 'full',
            emptyDescription: 'Enter an Ollama API key below.',
          },
          {
            key: 'baseUrl',
            type: 'string',
            label: 'Base URL',
            default: 'https://ollama.com/api',
            placeholder: 'https://ollama.com/api',
            required: true,
            format: 'url',
            validation: {
              url: { protocols: ['https:'], pathname: '/api' },
              message: 'Base URL must be an HTTPS origin followed by /api.',
            },
            layout: 'full',
            emptyDescription: 'Uses https://ollama.com/api when empty.',
          },
          {
            key: 'timeoutMs',
            type: 'integer',
            label: 'Timeout (s)',
            default: 300_000,
            min: 1_000,
            max: 600_000,
            unit: 'seconds',
            emptyDescription: 'Uses 300 seconds when empty.',
          },
          {
            key: 'maxResults',
            type: 'integer',
            label: 'Provider result limit',
            default: 5,
            min: 1,
            max: 20,
            emptyDescription: 'Uses 5 results when empty.',
          },
        ],
      },
      {
        id: 'copilot',
        label: 'GitHub Copilot search',
        description: 'Broker search through a model served by Copilot Responses.',
        capabilities: ['search', 'fetch'],
        settings: [
          {
            key: 'model',
            type: 'select',
            label: 'Broker model',
            description: 'Model used to broker search through Copilot Responses.',
            default: 'gpt-5-mini',
            options: [
              { label: 'GPT-5 mini', value: 'gpt-5-mini' },
              { label: 'GPT-5.6 Sol', value: 'gpt-5.6-sol' },
              { label: 'GPT-5.6 Terra', value: 'gpt-5.6-terra' },
            ],
          },
          {
            key: 'maxResults',
            type: 'integer',
            label: 'Provider result limit',
            default: 5,
            min: 1,
            max: 20,
          },
        ],
      },
      {
        id: 'duckduckgo',
        label: 'DuckDuckGo fallback',
        description: 'No-key HTML search with direct HTTPS page fetching.',
        capabilities: ['search', 'fetch'],
        settings: [
          {
            key: 'searchUrl',
            type: 'string',
            label: 'Search URL',
            default: 'https://html.duckduckgo.com/html/',
            required: true,
            format: 'url',
            layout: 'full',
            emptyDescription:
              'Uses https://html.duckduckgo.com/html/ when empty.',
          },
          {
            key: 'timeoutMs',
            type: 'integer',
            label: 'Timeout (s)',
            default: 300_000,
            min: 1_000,
            max: 600_000,
            unit: 'seconds',
            emptyDescription: 'Uses 300 seconds when empty.',
          },
          {
            key: 'maxResults',
            type: 'integer',
            label: 'Provider result limit',
            default: 5,
            min: 1,
            max: 20,
            emptyDescription: 'Uses 5 results when empty.',
          },
        ],
      },
    ],
  },
  settings: {
    priority: ['ollama', 'copilot', 'duckduckgo'],
    fallback: true,
    allowedDomains: [],
    blockedDomains: [],
  },
  providers: {
    ollama: {
      enabled: false,
      settings: {
        baseUrl: 'https://ollama.com/api',
        timeoutMs: 300_000,
        maxResults: 5,
      },
      secret_sources: {},
    },
    copilot: {
      enabled: true,
      settings: { model: 'gpt-5-mini', maxResults: 5 },
      secret_sources: {},
    },
    duckduckgo: {
      enabled: false,
      settings: {
        searchUrl: 'https://html.duckduckgo.com/html/',
        timeoutMs: 300_000,
        maxResults: 5,
      },
      secret_sources: {},
    },
  },
}

function cloneAccountsList(list: AccountsListResponse): AccountsListResponse {
  return {
    accounts: list.accounts.map((account) => ({ ...account })),
    active_key: list.active_key,
  }
}

function cloneSnapshot(snapshot: SearchSettingsResponse): SearchSettingsResponse {
  return structuredClone(snapshot)
}

function applyValues(
  current: Record<string, ConnectorSettingValue>,
  updates: Record<string, ConnectorSettingValue | null> | undefined,
): Record<string, ConnectorSettingValue> {
  const next = { ...current }
  for (const [key, value] of Object.entries(updates ?? {})) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}

function updateSnapshot(
  snapshot: SearchSettingsResponse,
  update: SearchSettingsUpdateRequest,
): SearchSettingsResponse {
  const providers = structuredClone(snapshot.providers)
  for (const [id, providerUpdate] of Object.entries(update.providers ?? {})) {
    const current = providers[id] ?? {
      enabled: true,
      settings: {},
      secret_sources: {},
    }
    providers[id] = {
      ...current,
      ...(providerUpdate.enabled === undefined
        ? {}
        : { enabled: providerUpdate.enabled }),
      settings: applyValues(current.settings, providerUpdate.settings),
    }
  }
  return {
    ...snapshot,
    settings: applyValues(snapshot.settings, update.settings),
    providers,
  }
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('This capability is unavailable in the UI preview.'))
}

export function createPreviewSettingsCapabilities(): SettingsCapabilities {
  let accountList = cloneAccountsList(initialAccountsList)
  let snapshot = cloneSnapshot(initialSearchSettings)
  let menuBarEnabled = false
  let menuBarAttempt: MenuBarModeAttempt | null = null
  let menuBarAttemptSequence = 0
  const menuBarState = (): MenuBarModeState => ({
    enabled: menuBarEnabled,
    pending: menuBarAttempt !== null,
  })
  const requireMenuBarAttempt = (attemptId: string): void => {
    if (menuBarAttempt?.attemptId !== attemptId) {
      throw new Error('Menu-bar-only confirmation is no longer active')
    }
  }
  return {
    kind: 'main-bridge',
    subscribe: () => () => undefined,
    account: {
      status: unavailable,
      start: unavailable,
      cancel: unavailable,
      signOut: unavailable,
    },
    accounts: {
      list: () => Promise.resolve(cloneAccountsList(accountList)),
      switchTo: (key) => {
        accountList = {
          accounts: accountList.accounts.map((account) => ({
            ...account,
            active: account.key === key,
            enabled: account.key === key ? true : account.enabled,
          })),
          active_key: key,
        }
        return Promise.resolve()
      },
      setEnabled: (key, enabled) => {
        accountList = {
          accounts: accountList.accounts.map((account) => ({
            ...account,
            active: account.key === key && !enabled ? false : account.active,
            enabled: account.key === key ? enabled : account.enabled,
          })),
          active_key:
            accountList.active_key === key && !enabled
              ? null
              : accountList.active_key,
        }
        return Promise.resolve()
      },
      reorder: (keys) => {
        const accountsByKey = new Map(
          accountList.accounts.map((account) => [account.key, account]),
        )
        accountList = {
          ...accountList,
          accounts: keys.flatMap((key) => {
            const account = accountsByKey.get(key)
            return account ? [account] : []
          }),
        }
        return Promise.resolve()
      },
    },
    ollamaAccounts: { list: unavailable },
    ollamaSettings: { get: unavailable, update: unavailable },
    ollamaRuntime: {
      status: () =>
        Promise.resolve({
          installation: 'application',
          installed: true,
          running: true,
          can_launch: true,
          can_manage: true,
          application_path: '/Applications/Ollama.app',
          server_configuration_path: '~/.ollama/server.json',
          desktop_settings_path: '~/Library/Application Support/Ollama/db.sqlite',
          endpoint: 'http://127.0.0.1:11434',
          context_length: 4096,
        }),
      launch: unavailable,
      updateContextLength: unavailable,
    },
    general: {
      menuBarMode: () => Promise.resolve(menuBarState()),
      beginMenuBarOnly: () => {
        menuBarEnabled = true
        menuBarAttempt = {
          attemptId: `preview-menu-bar-${String(++menuBarAttemptSequence)}`,
          deadlineMs: Date.now() + 15_000,
        }
        return Promise.resolve(menuBarAttempt)
      },
      confirmMenuBarOnly: (attemptId) =>
        Promise.resolve().then(() => {
          requireMenuBarAttempt(attemptId)
          menuBarAttempt = null
          return menuBarState()
        }),
      cancelMenuBarOnly: (attemptId) =>
        Promise.resolve().then(() => {
          requireMenuBarAttempt(attemptId)
          menuBarEnabled = false
          menuBarAttempt = null
          return menuBarState()
        }),
      disableMenuBarOnly: () => {
        menuBarEnabled = false
        menuBarAttempt = null
        return Promise.resolve(menuBarState())
      },
    },
    providerOnboarding: {
      get: () => Promise.resolve({ dismissed: false }),
      setDismissed: (dismissed) => Promise.resolve({ dismissed }),
    },
    connections: {
      list: unavailable,
      act: unavailable,
      revealCredential: unavailable,
      installations: unavailable,
    },
    apps: { list: unavailable, setEnabled: unavailable },
    connection: { proxyUrl: unavailable },
    apiKeys: {
      list: unavailable,
      create: unavailable,
      update: unavailable,
      remove: unavailable,
      setEnforcement: unavailable,
    },
    models: { list: unavailable, refresh: unavailable },
    localModels: {
      list: unavailable,
      ensure: unavailable,
      cancel: unavailable,
      openFolder: unavailable,
      subscribe: () => () => undefined,
    },
    usage: { get: unavailable },
    logs: { location: unavailable, list: unavailable, reveal: unavailable, coreLocation: unavailable, revealCore: unavailable },
    diagnostics: { get: unavailable },
    search: {
      get: () => Promise.resolve(cloneSnapshot(snapshot)),
      update: (update) => {
        snapshot = updateSnapshot(snapshot, update)
        return Promise.resolve(cloneSnapshot(snapshot))
      },
      validateProvider: ({ settings }): Promise<SearchProviderValidationResponse> => {
        const result: SearchProviderValidationResponse =
          settings?.apiKey === 'rejected-key'
            ? {
                status: 'invalid',
                fieldErrors: {
                  apiKey: 'API key was rejected by Ollama hosted search.',
                },
              }
            : { status: 'valid', fieldErrors: {} }
        return Promise.resolve(result)
      },
    },
    onOpenRequest: () => () => undefined,
    openExternal: unavailable,
  }
}
