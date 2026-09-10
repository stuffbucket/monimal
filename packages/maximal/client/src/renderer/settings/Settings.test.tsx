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
import { AppFrame } from '../frame/AppFrame'
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
    },
    general: {
      menuBarMode: vi.fn(async () => ({ enabled: false, pending: false })),
      beginMenuBarOnly: vi.fn(async () => ({ attemptId: 'attempt-1', deadlineMs: 1 })),
      confirmMenuBarOnly: vi.fn(async () => ({ enabled: true, pending: false })),
      cancelMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
      disableMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
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
      reveal: vi.fn(async () => {}),
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
      <AppFrame view="settings" onSelectView={vi.fn()}>
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

function activeHeadingId(surface: HTMLElement): string | undefined {
  const headings = surface.querySelectorAll('.settings-page h1[id]')
  expect(headings).toHaveLength(1)
  return headings[0]?.id
}

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('Settings', () => {
  it('lists exactly the manifest sections in the rail, in order', async () => {
    const surface = await renderSettings()

    expect([...surface.querySelectorAll('.settings-rail__link')].map((link) => link.textContent)).toEqual(
      SETTINGS_SECTIONS.map(({ label }) => label),
    )
  })

  it('renders only the default section at first', async () => {
    const surface = await renderSettings()

    expect(activeHeadingId(surface)).toBe(DEFAULT_SETTINGS_SECTION_ID)
    expect(selectedId(surface)).toBe(DEFAULT_SETTINGS_SECTION_ID)
  })

  it('selects every manifest destination into the same tabpanel', async () => {
    const surface = await renderSettings()
    const tabpanel = surface.querySelector<HTMLElement>('.tabpanel')
    if (tabpanel === null) throw new Error('the Settings tabpanel did not render')

    for (const { id } of SETTINGS_SECTIONS) {
      const button = surface.querySelector<HTMLButtonElement>(`[data-testid="settings-rail-${id}"]`)
      if (button === null) throw new Error(`the Settings rail omitted ${id}`)
      expect(button.getAttribute('aria-controls')).toBe(tabpanel.id)

      await act(async () => button.click())

      expect(activeHeadingId(surface)).toBe(id)
      expect(selectedId(surface)).toBe(id)
    }
  })

  it('renders only the selected section as the primary heading', async () => {
    const surface = await renderSettings()

    const primaryHeading = surface.querySelector('.settings-page h1')
    expect(primaryHeading?.textContent).toBe('Account')
    expect(surface.textContent).not.toContain('On this page')
    expect(surface.querySelector('#settings-heading')).toBeNull()
    expect(surface.querySelector('nav.settings-rail')?.getAttribute('aria-label')).toBe(
      'Settings sections',
    )
  })

  it('selects a section requested while opening Settings', async () => {
    const surface = await renderSettings({ id: 'settings-api-keys-heading' })

    expect(activeHeadingId(surface)).toBe('settings-api-keys-heading')
    expect(selectedId(surface)).toBe('settings-api-keys-heading')
  })

  it('adopts live and repeated native section requests', async () => {
    const surface = await renderSettings({ id: 'settings-endpoint-heading' })
    const models = surface.querySelector<HTMLButtonElement>(
      '[data-testid="settings-rail-settings-models-heading"]',
    )
    if (models === null) throw new Error('the Models rail entry did not render')

    await act(async () => models.click())
    await rerender({ id: 'settings-endpoint-heading' })
    expect(activeHeadingId(surface)).toBe('settings-endpoint-heading')

    await act(async () => models.click())
    await rerender({ id: 'settings-endpoint-heading' })
    expect(activeHeadingId(surface)).toBe('settings-endpoint-heading')
    expect(selectedId(surface)).toBe('settings-endpoint-heading')
  })

  it('preserves the user selection when a native request is cleared', async () => {
    const surface = await renderSettings({ id: 'settings-endpoint-heading' })
    const models = surface.querySelector<HTMLButtonElement>(
      '[data-testid="settings-rail-settings-models-heading"]',
    )
    if (models === null) throw new Error('the Models rail entry did not render')

    await act(async () => models.click())
    await rerender()

    expect(activeHeadingId(surface)).toBe('settings-models-heading')
    expect(selectedId(surface)).toBe('settings-models-heading')
  })

  it('labels the Settings page with the selected section heading', async () => {
    const surface = await renderSettings({ id: 'settings-models-heading' })
    const page = surface.querySelector<HTMLElement>('.settings-page')
    if (page === null) throw new Error('the Settings page did not render')

    expect(page.getAttribute('aria-labelledby')).toBe('settings-models-heading')
    expect(document.getElementById('settings-models-heading')?.tagName).toBe('H1')
  })

  it('injects its surface styles when no style element exists', async () => {
    document.querySelectorAll('#settings-styles').forEach((style) => style.remove())

    await renderSettings()

    const style = document.getElementById('settings-styles')
    expect(style).toBeInstanceOf(HTMLStyleElement)
    expect(style?.tagName).toBe('STYLE')
    expect(style?.textContent).toContain('.settings-page {')
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
