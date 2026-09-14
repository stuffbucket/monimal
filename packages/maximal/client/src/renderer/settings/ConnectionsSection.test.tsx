import type {
  ApiKeyEntry,
  AppEntry,
  AppsListResponse,
  ConnectionEntry,
  ConnectionsListResponse,
} from '@stuffbucket/maximal-core/settings-types'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsCapabilities } from './capabilities'
import { ConnectionsSection } from './ConnectionsSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const connectedClaudeCode: ConnectionEntry = {
  id: 'claude-code',
  name: 'Claude Code',
  status: 'connected',
  allowed_actions: ['disconnect'],
  detail: null,
  credential: {
    id: 'managed:claude-code',
    label: 'Claude Code',
    kind: 'managed',
    enabled: true,
  },
  ownership: {
    configurator_id: 'claude-code',
    target_path: '/home/maximal/.claude/settings.json',
    pid: 42,
    started_at: '2026-09-08T12:00:00.000Z',
  },
  recovery: null,
}

const manualKey: ApiKeyEntry = {
  id: 'manual-client',
  label: 'Local script',
  key: 'manual-secret-value',
  enabled: true,
  created_at: '2026-09-08T12:00:00.000Z',
  kind: 'manual',
}

const connectionList: ConnectionsListResponse = {
  clients: [connectedClaudeCode],
  manual_credentials: [
    {
      id: manualKey.id,
      label: manualKey.label,
      kind: 'manual',
      enabled: true,
    },
  ],
  require_known_keys: false,
}

const healthyClaudeCode: AppEntry = {
  id: 'claude-code',
  name: 'Claude Code CLI',
  kind: 'config',
  enabled: true,
  status: 'ready',
  installs: [],
  install: null,
  conflict: null,
  health: { ok: true, issue: null },
}

const unhealthyClaudeDesktop: AppEntry = {
  id: 'claude-desktop',
  name: 'Claude Desktop',
  kind: 'config',
  enabled: true,
  status: 'ready',
  installs: [],
  install: null,
  conflict: null,
  health: { ok: false, issue: 'not-applied' },
}

const appsList: AppsListResponse = {
  apps: [healthyClaudeCode, unhealthyClaudeDesktop],
}

function fakeCapabilities() {
  const connections = {
    list: vi.fn(async () => connectionList),
    act: vi.fn(async () => ({
      ...connectedClaudeCode,
      status: 'available' as const,
      allowed_actions: ['connect' as const],
      credential: null,
      ownership: null,
    })),
    revealCredential: vi.fn(async (id: string) => ({
      id,
      key: 'managed-secret-value',
    })),
  }
  const apiKeys = {
    list: vi.fn(async () => ({
      entries: [manualKey],
      enforcing: false,
    })),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(async () => {}),
    setEnforcement: vi.fn(async (enforcing: boolean) => ({
      entries: [manualKey],
      enforcing,
    })),
  }
  const apps = {
    list: vi.fn(async () => appsList),
    setEnabled: vi.fn(async (id: AppEntry['id']) => ({
      ...unhealthyClaudeDesktop,
      id,
      health: { ok: true, issue: null } as const,
    })),
  }
  const capabilities = {
    connection: {
      proxyUrl: vi.fn(async () => 'http://127.0.0.1:4173'),
    },
    connections,
    apiKeys,
    apps,
    subscribe: vi.fn(() => () => {}),
  } as unknown as SettingsCapabilities

  return { capabilities, connections, apiKeys, apps }
}

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

async function renderConnections(
  capabilities: SettingsCapabilities,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(<ConnectionsSection capabilities={capabilities} />)
    await Promise.resolve()
  })
  return container
}

function control(surface: HTMLElement, testId: string): HTMLButtonElement {
  const element = surface.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  )
  if (element === null) throw new Error(`${testId} control was not rendered`)
  return element
}

function button(surface: ParentNode, label: string): HTMLButtonElement {
  const element = [...surface.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (element === undefined) throw new Error(`${label} button was not rendered`)
  return element
}

describe('ConnectionsSection', () => {
  it('combines addresses, configured clients, credentials, and access policy', async () => {
    const { capabilities, apiKeys } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    expect(surface.querySelector('h1')).toBeNull()
    expect(surface.textContent).toContain('http://127.0.0.1:4173')
    expect(surface.textContent).toContain('http://127.0.0.1:4173/v1')
    expect(surface.textContent).toContain('Claude Code')
    expect(surface.textContent).toContain('Connected')
    expect(surface.textContent).toContain('Managed credential · Enabled')
    expect(surface.textContent).toContain('1 credential')
    expect(surface.textContent).toContain('Require known keys')
    expect(surface.textContent).toContain('anonymous local requests are allowed')
    expect(surface.textContent).not.toContain('managed-secret-value')
    expect(surface.textContent).not.toContain(manualKey.key)
    expect(apiKeys.list).not.toHaveBeenCalled()
  })

  it('reveals a managed credential only after an explicit action', async () => {
    const { capabilities, connections } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    await act(async () => button(surface, 'Reveal').click())

    expect(connections.revealCredential).toHaveBeenCalledWith(
      'managed:claude-code',
    )
    expect(surface.textContent).toContain('managed-secret-value')
  })

  it('uses the server-provided action list for supported clients', async () => {
    const { capabilities, connections } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    await act(async () =>
      control(surface, 'connection-claude-code-disconnect').click(),
    )

    expect(connections.act).toHaveBeenCalledWith('claude-code', 'disconnect')
    expect(surface.textContent).toContain('Available')
    expect(
      surface.querySelector('[data-testid="connection-claude-code-connect"]'),
    ).not.toBeNull()
  })

  it('changes protected mode through the advanced control', async () => {
    const { capabilities, apiKeys } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    await act(async () => control(surface, 'api-key-enforcement').click())

    expect(apiKeys.setEnforcement).toHaveBeenCalledWith(true)
  })

  it('shows a health notice and a fix control only for an unhealthy app', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    expect(surface.textContent).toContain('Claude Code CLI')
    expect(surface.textContent).toContain('Claude Desktop')
    expect(surface.textContent).toContain(
      "It's set to route through Maximal, but its configuration is missing or was changed outside of Maximal.",
    )
    expect(control(surface, 'app-claude-desktop-fix')).not.toBeNull()
    expect(
      surface.querySelector('[data-testid="app-claude-code-fix"]'),
    ).toBeNull()
  })

  it('requires confirmation before fixing an unhealthy app', async () => {
    const { capabilities, apps } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    await act(async () => control(surface, 'app-claude-desktop-fix').click())

    expect(apps.setEnabled).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Fix Claude Desktop settings?')

    await act(async () => button(document.body, 'Fix settings').click())

    expect(apps.setEnabled).toHaveBeenCalledWith('claude-desktop', true)
  })

  it('cancelling the fix dialog leaves the app unchanged', async () => {
    const { capabilities, apps } = fakeCapabilities()
    const surface = await renderConnections(capabilities)

    await act(async () => control(surface, 'app-claude-desktop-fix').click())
    await act(async () => button(document.body, 'Cancel').click())

    expect(apps.setEnabled).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(
      'Fix Claude Desktop settings?',
    )
  })
})
