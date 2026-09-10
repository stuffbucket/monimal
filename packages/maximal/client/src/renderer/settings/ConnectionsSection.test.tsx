import type {
  ApiKeyEntry,
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
  const capabilities = {
    connection: {
      proxyUrl: vi.fn(async () => 'http://127.0.0.1:4173'),
    },
    connections,
    apiKeys,
    subscribe: vi.fn(() => () => {}),
  } as unknown as SettingsCapabilities

  return { capabilities, connections, apiKeys }
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

    expect(surface.querySelectorAll('h1')).toHaveLength(1)
    expect(surface.querySelector('h1')?.textContent).toBe('Connections')
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
})
