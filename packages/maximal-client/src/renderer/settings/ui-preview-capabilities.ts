import {
  copilotSearchProvider,
  duckDuckGoSearchProvider,
  ollamaSearchProvider,
  type SearchProvider,
} from '@maximal/maximal-search'
import type { AgentEffort, ProviderStatus } from '@maximal/maximal-harness'

import terminalFontDownloads from '../../shared/terminal-font-downloads.json' with { type: 'json' }
import { TERMINAL_THICKEN_DEFAULT } from '../../shared/host'

import type {
  AccountsListResponse,
  AssistantOverlayPreferences,
  ConnectorSettingValue,
  MenuBarModeAttempt,
  MenuBarModeState,
  ModelsListResponse,
  SearchProviderValidationResponse,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
  SettingsCapabilities,
  TerminalFontCatalog,
  TerminalTypographySettings,
  WorkbarLayout,
} from './capabilities'

const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'

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

const previewModels: ModelsListResponse = {
  models: [{
    id: 'gpt-5',
    name: 'GPT-5',
    vendor: 'GitHub Copilot',
    provider: 'github-copilot',
    location: 'cloud',
    family: 'gpt',
    type: 'chat',
    preview: false,
    context_window_tokens: 128_000,
    max_output_tokens: 32_000,
    capabilities: {
      vision: true,
      image_generation: false,
      video_generation: false,
      tool_calls: true,
      streaming: true,
      reasoning: true,
    },
  }],
  count: 1,
  loaded_at: '2026-09-29T12:00:00Z',
}

type ManifestProvider = SearchSettingsResponse['manifest']['providers'][number]

/** The preview never searches, so no provider is ever bound. */
const unbound = (): never => {
  throw new Error('the UI preview does not search')
}

const previewCopilotModels = [
  { label: 'GPT-5 mini', value: 'gpt-5-mini' },
  { label: 'GPT-5.6 Sol', value: 'gpt-5.6-sol' },
  { label: 'GPT-5.6 Terra', value: 'gpt-5.6-terra' },
]

/** `T` without `readonly`, so the compiler still checks every other part of its shape. */
type Writable<T> =
  T extends readonly (infer U)[] ? Writable<U>[]
  : T extends object ? { -readonly [K in keyof T]: Writable<T[K]> }
  : T

/** The descriptor the host sends for a provider, taken from the provider itself. */
function manifestEntry(provider: SearchProvider): ManifestProvider {
  const { id, label, description, capabilities, settings } = provider
  return structuredClone({ id, label, description, capabilities, settings }) as Writable<{
    id: typeof id
    label: typeof label
    description: typeof description
    capabilities: typeof capabilities
    settings: typeof settings
  }>
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
      manifestEntry(ollamaSearchProvider(unbound)),
      manifestEntry(copilotSearchProvider(unbound, previewCopilotModels)),
      manifestEntry(duckDuckGoSearchProvider(unbound)),
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
  let terminalTypography: TerminalTypographySettings = {
    fontFamily: 'JetBrainsMono Nerd Font Mono',
    fontSize: 13,
    fontWeight: 400,
    fontVariations: {},
    cellHeight: 0,
    tracking: 0,
    baseline: 0,
    thicken: false,
    thickenStrength: TERMINAL_THICKEN_DEFAULT,
    ligatures: true,
  }
  const typographyListeners = new Set<
    (settings: TerminalTypographySettings) => void
  >()
  let workbarLayout: WorkbarLayout = {
    order: ['home', 'projects', 'overview', 'traffic', 'terminals', 'browsers'],
    visible: ['home', 'projects', 'overview', 'traffic', 'terminals', 'browsers'],
  }
  const workbarListeners = new Set<(layout: WorkbarLayout) => void>()
  const installedFontIds = new Set([
    'fira-code',
    'hack',
    'jetbrains-mono',
  ])
  const terminalFontCatalog = (): TerminalFontCatalog => ({
    status: 'available',
    fonts: [
      'FiraCode Nerd Font Mono',
      'Hack Nerd Font Mono',
      'JetBrainsMono Nerd Font Mono',
      'MesloLGS NF',
      ...terminalFontDownloads
        .filter(({ id }) => installedFontIds.has(id))
        .map(({ family }) => family),
    ].filter((family, index, families) => families.indexOf(family) === index),
    fontWeights: {
      'FiraCode Nerd Font Mono': [300, 400, 500, 600, 700],
      'Hack Nerd Font Mono': [400, 700],
      'JetBrainsMono Nerd Font Mono': [300, 400, 500, 600, 700],
      'MesloLGS NF': [400, 700],
      'AtkynsonMono Nerd Font Mono': [300, 400, 500, 700],
      'IntoneMono Nerd Font Mono': [300, 400, 500, 600, 700],
      '0xProto Nerd Font Mono': [400, 700],
    },
    fontAxes: {
      'JetBrainsMono Nerd Font Mono': [
        { tag: 'wght', minimum: 100, default: 400, maximum: 900 },
        { tag: 'GRAD', minimum: -100, default: 0, maximum: 150 },
        { tag: 'WONK', minimum: 0, default: 0, maximum: 1 },
      ],
    },
    downloads: terminalFontDownloads.map(({
      id,
      label,
      family,
      downloadSize,
      license,
      sourceUrl,
    }) => ({
      id,
      label,
      family,
      downloadSize,
      license,
      sourceUrl,
      installed: installedFontIds.has(id),
    })),
    ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
  })
  let assistantOverlay: AssistantOverlayPreferences = {
    candy: true,
    approval: 'writes',
    outputFont: 'auto',
    hotkey: 'CommandOrControl+Shift+Space',
  }
  const assistantModels = [
    {
      key: 'maximal:claude-haiku',
      label: 'Claude Haiku',
      model: 'claude-haiku',
      provider: 'maximal' as const,
      description: 'Fast responses',
      efforts: ['low', 'medium', 'high'] as AgentEffort[],
    },
    {
      key: 'maximal:claude-sonnet',
      label: 'Claude Sonnet',
      model: 'claude-sonnet',
      provider: 'maximal' as const,
      description: 'Extended reasoning',
      efforts: ['low', 'medium', 'high', 'xhigh'] as AgentEffort[],
    },
  ]
  let assistantProvider: ProviderStatus = {
    state: 'ready',
    provider: 'maximal',
    model: assistantModels[0].model,
    modelKey: assistantModels[0].key,
    models: assistantModels,
    effort: 'medium',
  }
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
      usage: () =>
        Promise.resolve({
          copilot_plan: 'enterprise',
          quota_reset_date: '2026-09-30T00:00:00Z',
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 650,
              percent_remaining: 65,
            },
            completions: { unlimited: true },
          },
        }),
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
    ollamaAccounts: { list: () => Promise.resolve({ accounts: [] }) },
    ollamaSettings: {
      get: () => Promise.resolve({
        has_api_key: false,
        api_key: null,
        credential_source: 'none',
        cloud_enabled: false,
        local_enabled: true,
        local_endpoint: OLLAMA_ENDPOINT,
        prefer_local_models: true,
      }),
      update: unavailable,
      testApiKey: unavailable,
    },
    systemOneSettings: {
      get: () => Promise.resolve({
        has_api_key: false,
        api_key: null,
        credential_source: 'none',
        local_provider: 'maximal',
        ollama_configured: false,
        model_order: ['nimble', 'tev1', 'tev1:0.8b'],
        fallback_to_local: true,
      }),
      update: unavailable,
    },
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
          endpoint: OLLAMA_ENDPOINT,
          process_id: 42,
          process_endpoint: OLLAMA_ENDPOINT,
          suggested_endpoint: null,
          context_length: 4096,
        }),
      launch: unavailable,
      updateContextLength: unavailable,
      preferences: () => Promise.resolve({
        start_on_maximal_launch: false,
        cloud_disabled: false,
        restart_required: false,
      }),
      updatePreferences: unavailable,
    },
    general: {
      desktopSettings: () => Promise.resolve({
        version: '0.0.0-preview',
        startOnLogin: false,
        quickAccessShortcut: 'control-control',
      }),
      setStartOnLogin: (enabled) => Promise.resolve({
        version: '0.0.0-preview',
        startOnLogin: enabled,
        quickAccessShortcut: 'control-control',
      }),
      appearance: () => Promise.resolve({
        vibrancyEnabled: false,
        vibrancySupported: true,
        backgroundEffectsEnabled: false,
        reducedMotionEnabled: false,
      }),
      setVibrancyEnabled: (enabled) => Promise.resolve({
        vibrancyEnabled: enabled,
        vibrancySupported: true,
        backgroundEffectsEnabled: false,
        reducedMotionEnabled: false,
      }),
      setBackgroundEffectsEnabled: (enabled) => Promise.resolve({
        vibrancyEnabled: false,
        vibrancySupported: true,
        backgroundEffectsEnabled: enabled,
        reducedMotionEnabled: false,
      }),
      setReducedMotionEnabled: (enabled) => Promise.resolve({
        vibrancyEnabled: false,
        vibrancySupported: true,
        backgroundEffectsEnabled: false,
        reducedMotionEnabled: enabled,
      }),
      onAppearanceChange: () => () => {},
      material: () => Promise.resolve({
        preset: 'clouds',
        quality: 'balanced',
        strength: 0.75,
        motion: 0.5,
        lighting: 'fixed',
        timezone: 'UTC',
      }),
      setMaterial: (preference) => Promise.resolve(preference),
      onMaterialChange: () => () => {},
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
      systemNotificationStatus: () =>
        Promise.resolve({ supported: true, canOpenSettings: true }),
      openSystemNotificationSettings: () => Promise.resolve(),
      assistantOverlay: () => Promise.resolve(assistantOverlay),
      assistantProvider: () => Promise.resolve(assistantProvider),
      setAssistantModel: (modelKey) => {
        const model = assistantModels.find(({ key }) => key === modelKey)
        if (model === undefined) return Promise.reject(new Error('Model is unavailable.'))
        assistantProvider = {
          state: 'ready',
          provider: model.provider,
          model: model.model,
          modelKey: model.key,
          models: assistantModels,
          effort: model.efforts.includes('medium') ? 'medium' : model.efforts[0],
        }
        return Promise.resolve(assistantProvider)
      },
      setAssistantEffort: (effort) => {
        if (assistantProvider.state !== 'ready') {
          return Promise.reject(new Error('Assistant model is unavailable.'))
        }
        assistantProvider = { ...assistantProvider, effort }
        return Promise.resolve(assistantProvider)
      },
      updateAssistantOverlay: (update) => {
        assistantOverlay = { ...assistantOverlay, ...update }
        return Promise.resolve(assistantOverlay)
      },
    },
    providerOnboarding: {
      get: () => Promise.resolve({ dismissed: false }),
      setDismissed: (dismissed) => Promise.resolve({ dismissed }),
    },
    projects: {
      snapshot: () => Promise.resolve({ roots: [], projects: [], refreshing: false }),
      addRoot: () => Promise.resolve(null),
      updateRoot: unavailable,
      removeRoot: unavailable,
      refresh: () => Promise.resolve({ roots: [], projects: [], refreshing: false }),
      subscribe: () => () => undefined,
    },
    terminalTypography: {
      get: () => Promise.resolve(terminalTypography),
      update: (settings) => {
        terminalTypography = settings
        typographyListeners.forEach((listener) => listener(settings))
        return Promise.resolve(terminalTypography)
      },
      fonts: () => Promise.resolve(terminalFontCatalog()),
      installFont: async (fontId) => {
        await new Promise((resolve) => setTimeout(resolve, 600))
        installedFontIds.add(fontId)
        return terminalFontCatalog()
      },
      openPreview: () => {
        const url = new URL(window.location.href)
        url.search = '?terminalTypographyPreview=true'
        const preview = window.open(
          url,
          'maximal-terminal-typography-preview',
          'popup,width=1180,height=760',
        )
        return preview === null
          ? Promise.reject(new Error('The browser blocked the preview window.'))
          : Promise.resolve()
      },
      subscribe: (listener) => {
        typographyListeners.add(listener)
        return () => typographyListeners.delete(listener)
      },
    },
    workbar: {
      get: () => Promise.resolve(workbarLayout),
      update: (layout) => {
        workbarLayout = layout
        workbarListeners.forEach((listener) => listener(layout))
        return Promise.resolve(layout)
      },
      subscribe: (listener) => {
        workbarListeners.add(listener)
        return () => workbarListeners.delete(listener)
      },
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
    models: {
      list: () => Promise.resolve(structuredClone(previewModels)),
      refresh: () => Promise.resolve(structuredClone(previewModels)),
    },
    localModels: {
      list: () => Promise.resolve({
        revision: 1,
        models: [{
          key: 'qwen-local',
          modelId: 'qwen-local',
          displayName: 'Qwen Local',
          format: 'gguf',
          expectedBytes: 1024,
          publication: 'provider',
          state: 'registered',
          capabilities: { input: ['text'], output: ['text'] },
          context: { contextWindow: 32_768, maxOutputTokens: 4096 },
        }],
      }),
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
    copyText: unavailable,
    openExternal: unavailable,
  }
}
