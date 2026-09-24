import type {
  AccountsListResponse,
  AuthStatus,
  TokenUsagePeriod,
} from '@stuffbucket/maximal-core/settings-types'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SETTINGS_SECTION_ID,
  SETTINGS_SECTIONS,
} from '../../shared/settings-sections'
import { AppFrame, PRODUCT_TABS } from '../frame/AppFrame'
import type { SettingsCapabilities } from './capabilities'
import { Settings, type SettingsSectionRequest } from './Settings'

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const authStatus: AuthStatus = { state: 'unauthenticated' }
const accountsList: AccountsListResponse = { accounts: [], active_key: null }
const ollamaAccountsList = { accounts: [] }

function fakeCapabilities(): SettingsCapabilities {
  return {
    kind: 'main-bridge',
    subscribe: vi.fn(() => () => {}),
    account: {
      status: vi.fn(async () => authStatus),
      start: vi.fn(async () => authStatus),
      cancel: vi.fn(async () => authStatus),
      signOut: vi.fn(async () => {}),
    },
    accounts: {
      list: vi.fn(async () => accountsList),
      switchTo: vi.fn(async () => {}),
      setEnabled: vi.fn(async () => {}),
      reorder: vi.fn(async () => {}),
    },
    ollamaAccounts: {
      list: vi.fn(async () => ollamaAccountsList),
    },
    ollamaSettings: {
      get: vi.fn(async () => ({
        has_api_key: false,
        credential_source: 'none' as const,
        local_enabled: true,
        prefer_local_models: true,
      })),
      update: vi.fn(),
    },
    ollamaRuntime: {
      status: vi.fn(async () => ({
        installation: 'none' as const,
        installed: false,
        running: false,
        can_launch: false,
        can_manage: false,
        application_path: null,
        server_configuration_path: '/home/test/.ollama/server.json',
        desktop_settings_path: null,
        endpoint: 'http://127.0.0.1:11434',
        context_length: null,
      })),
      launch: vi.fn(),
      updateContextLength: vi.fn(),
    },
    general: {
      menuBarMode: vi.fn(async () => ({ enabled: false, pending: false })),
      beginMenuBarOnly: vi.fn(async () => ({ attemptId: 'attempt-1', deadlineMs: 1 })),
      confirmMenuBarOnly: vi.fn(async () => ({ enabled: true, pending: false })),
      cancelMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
      disableMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
    },
    providerOnboarding: {
      get: vi.fn(async () => ({ dismissed: false })),
      setDismissed: vi.fn(async (dismissed: boolean) => ({ dismissed })),
    },
    connections: {
      list: vi.fn(async () => ({
        clients: [],
        manual_credentials: [],
        require_known_keys: false,
      })),
      act: vi.fn(),
      revealCredential: vi.fn(),
      installations: vi.fn(async () => []),
    },
    apps: {
      list: vi.fn(async () => ({ apps: [] })),
      setEnabled: vi.fn(),
    },
    connection: { proxyUrl: vi.fn(async () => 'http://127.0.0.1:4141') },
    apiKeys: {
      list: vi.fn(async () => ({ entries: [], enforcing: false })),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(async () => {}),
      setEnforcement: vi.fn(async (enforcing: boolean) => ({
        entries: [],
        enforcing,
      })),
    },
    models: {
      list: vi.fn(async () => ({ models: [], count: 0, loaded_at: null })),
      refresh: vi.fn(async () => ({ models: [], count: 0, loaded_at: null })),
    },
    localModels: {
      list: vi.fn(async () => ({ models: [], revision: 0 })),
      ensure: vi.fn(async (modelKey: string) => ({
        modelKey,
        operationId: 'operation-1',
        started: true,
      })),
      cancel: vi.fn(async (operationId: string) => ({
        operationId,
        cancelled: true,
      })),
      openFolder: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    },
    usage: {
      get: vi.fn(async (period: TokenUsagePeriod) => ({
        period,
        range: { start_ms: 0, end_ms: 0, start_utc: '', end_utc: '' },
        totals: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          request_count: 0,
          total_tokens: 0,
          total_nano_aiu: 0,
        },
        byModel: [],
        byProvider: [],
      })),
    },
    logs: {
      location: vi.fn(async () => '/tmp/maximal/logs'),
      list: vi.fn(async () => [{ name: 'sidecar.log', size: 42, modifiedAt: 1 }]),
      reveal: vi.fn(async () => {}),
      coreLocation: vi.fn(async () => '/tmp/core/logs'),
      revealCore: vi.fn(async () => {}),
    },
    diagnostics: {
      get: vi.fn(async () => ({
        version: '0.0.0',
        source_revision: null,
        source_branch: null,
        launch_path: '/tmp/maximal',
        launch_kind: 'dev' as const,
        pid: 1,
        uptime_ms: 0,
        account_type: 'unknown',
        models_cached: 0,
        tokens: {
          github_token_present: false,
          copilot_token_present: false,
        },
        rate_limit: {
          interval_seconds: null,
          last_request_at: null,
          wait_when_throttled: false,
        },
        web_search: { kind: 'none', detail: null },
      })),
    },
    search: {
      get: vi.fn(async () => ({
        manifest: {
          id: 'search' as const,
          label: 'Search',
          description: 'Search settings',
          fields: [],
          providers: [],
        },
        settings: {},
        providers: {},
      })),
      update: vi.fn(),
      validateProvider: vi.fn(async () => ({ status: 'valid' as const, fieldErrors: {} })),
    },
    onOpenRequest: vi.fn(() => () => {}),
    openExternal: vi.fn(async () => {}),
  }
}

let root: Root | null = null
let container: HTMLElement | null = null

async function renderSettings(request?: SettingsSectionRequest): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await rerender(request)
  return container
}

async function rerender(request?: SettingsSectionRequest): Promise<void> {
  await act(async () => {
    root?.render(
      <AppFrame tabs={PRODUCT_TABS} activeTab="settings" surface="settings" onSelectTab={vi.fn()}>
        <Settings capabilities={fakeCapabilities()} request={request ?? null} />
      </AppFrame>,
    )
  })
}

function selectedId(surface: HTMLElement): string | undefined {
  const selected = surface.querySelectorAll('.settings-rail__link[aria-current="page"]')
  expect(selected).toHaveLength(1)
  return selected[0]?.getAttribute('data-testid')?.replace('settings-rail-', '')
}

function activePageLabel(surface: HTMLElement): string | null {
  const heading = surface.querySelector('.settings > .settings__header h1')
  expect(heading).not.toBeNull()
  return heading?.textContent ?? null
}

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('Settings', () => {
  it('shows discovered desktop lifecycle logs and preserves the core log path', async () => {
    const surface = await renderSettings()
    const logs = surface.querySelector<HTMLButtonElement>('[data-testid="settings-rail-settings-logs-heading"]')
    if (logs === null) throw new Error('the Logs rail item is missing')
    await act(async () => logs.click())
    expect(surface.textContent).toContain('sidecar.log')
    expect(surface.textContent).toContain('/tmp/maximal/logs')
    expect(surface.textContent).toContain('/tmp/core/logs')
    expect(surface.textContent).toContain('Reveal desktop logs')
    expect(surface.textContent).toContain('Reveal core logs')
  })

  it('lists exactly the manifest sections in the rail, in order', async () => {
    const surface = await renderSettings()

    expect([...surface.querySelectorAll('.settings-rail__link')].map((link) => link.textContent)).toEqual(
      SETTINGS_SECTIONS.map(({ label }) => label),
    )
  })

  it('renders only the default section at first', async () => {
    const surface = await renderSettings()

    expect(activePageLabel(surface)).toBe('Accounts')
    expect(selectedId(surface)).toBe(DEFAULT_SETTINGS_SECTION_ID)
  })

  it('places the Connections rescan action in the shared header', async () => {
    const surface = await renderSettings()
    const connections = surface.querySelector<HTMLButtonElement>(
      '[data-testid="settings-rail-settings-connections-heading"]',
    )
    if (connections === null) throw new Error('the Connections rail item is missing')

    await act(async () => connections.click())

    const header = surface.querySelector<HTMLElement>('.settings__header')
    if (header === null) throw new Error('the Settings header is missing')
    const rescan = [...header.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rescan',
    )
    expect(rescan).toBeDefined()
    expect(rescan?.classList.contains('btn--primary')).toBe(true)
  })

  it('selects every manifest destination into the same tabpanel', async () => {
    const surface = await renderSettings()
    const tabpanel = surface.querySelector<HTMLElement>('.tabpanel')
    if (tabpanel === null) throw new Error('the Settings tabpanel did not render')

    for (const { id, label } of SETTINGS_SECTIONS) {
      const button = surface.querySelector<HTMLButtonElement>(`[data-testid="settings-rail-${id}"]`)
      if (button === null) throw new Error(`the Settings rail omitted ${id}`)
      expect(button.getAttribute('aria-controls')).toBe(tabpanel.id)

      await act(async () => button.click())

      expect(activePageLabel(surface)).toBe(label)
      expect(selectedId(surface)).toBe(id)
      expect(surface.querySelectorAll('.settings > .settings__header h1')).toHaveLength(1)
    }
  })

  it('uses the selected section label as the single content heading', async () => {
    const surface = await renderSettings()

    expect(activePageLabel(surface)).toBe('Accounts')
    expect(surface.querySelector('.settings > .settings__header h1')?.textContent).toBe(
      'Accounts',
    )
    expect(surface.textContent).not.toContain('On this page')
    expect(surface.querySelector('#settings-heading')).toBeNull()
    expect(surface.querySelector('nav.settings-rail')?.getAttribute('aria-label')).toBe(
      'Settings sections',
    )
  })

  it('selects a section requested while opening Settings', async () => {
    const surface = await renderSettings({ id: 'settings-connections-heading' })

    expect(activePageLabel(surface)).toBe('Connections')
    expect(selectedId(surface)).toBe('settings-connections-heading')
  })

  it('adopts live and repeated native section requests', async () => {
    const surface = await renderSettings({ id: 'settings-connections-heading' })
    const models = surface.querySelector<HTMLButtonElement>(
      '[data-testid="settings-rail-settings-models-heading"]',
    )
    if (models === null) throw new Error('the Models rail entry did not render')

    await act(async () => models.click())
    await rerender({ id: 'settings-connections-heading' })
    expect(activePageLabel(surface)).toBe('Connections')

    await act(async () => models.click())
    await rerender({ id: 'settings-connections-heading' })
    expect(activePageLabel(surface)).toBe('Connections')
    expect(selectedId(surface)).toBe('settings-connections-heading')
  })

  it('preserves the user selection when a native request is cleared', async () => {
    const surface = await renderSettings({ id: 'settings-connections-heading' })
    const models = surface.querySelector<HTMLButtonElement>(
      '[data-testid="settings-rail-settings-models-heading"]',
    )
    if (models === null) throw new Error('the Models rail entry did not render')

    await act(async () => models.click())
    await rerender()

    expect(activePageLabel(surface)).toBe('Cloud Models')
    expect(selectedId(surface)).toBe('settings-models-heading')
  })

  it('labels the Settings page with the selected manifest label', async () => {
    const surface = await renderSettings({ id: 'settings-models-heading' })
    const page = surface.querySelector<HTMLElement>('.settings')
    if (page === null) throw new Error('the Settings page did not render')

    expect(page.querySelector('h1')?.textContent).toBe('Cloud Models')
    expect(page.querySelectorAll('h1')).toHaveLength(1)
    expect(page.querySelector('.settings__header')).not.toBeNull()
    expect(page.querySelector('.settings__body.scroll-area')).not.toBeNull()
  })

  it('injects its surface styles when no style element exists', async () => {
    document.querySelectorAll('#settings-styles').forEach((style) => style.remove())

    await renderSettings()

    const style = document.getElementById('settings-styles')
    expect(style).toBeInstanceOf(HTMLStyleElement)
    expect(style?.tagName).toBe('STYLE')
    expect(style?.textContent).toContain('.settings-disclosure-list {')
    expect(style?.textContent).not.toContain('.settings-section__heading')
    expect(style?.textContent).toMatch(/\.settings-section__subheading\s*{[^}]*--shell-text-lg/s)
  })

  it('does not replace or duplicate an existing surface style element', async () => {
    document.querySelectorAll('#settings-styles').forEach((style) => style.remove())
    const existing = document.createElement('style')
    existing.id = 'settings-styles'
    existing.textContent = '.existing-settings-styles {}'
    document.head.appendChild(existing)

    await renderSettings()

    expect(document.querySelectorAll('#settings-styles')).toHaveLength(1)
    expect(document.getElementById('settings-styles')).toBe(existing)
    expect(existing.textContent).toBe('.existing-settings-styles {}')
  })
})
