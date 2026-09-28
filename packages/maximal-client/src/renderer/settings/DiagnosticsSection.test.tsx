import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsCapabilities } from './capabilities'
import { DiagnosticsSection } from './DiagnosticsSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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

function fakeCapabilities(): SettingsCapabilities {
  return {
    diagnostics: {
      get: vi.fn(async () => ({
        version: '1.2.3',
        source_revision: 'abcdef0',
        source_branch: 'main',
        launch_path: '/Applications/Maximal.app',
        launch_kind: 'dmg-app' as const,
        pid: 42,
        uptime_ms: 90_610_000,
        account_type: 'github',
        models_cached: 2,
        tokens: {
          github_token_present: true,
          copilot_token_present: true,
        },
        copilot_refresh: {
          health: 'healthy' as const,
          token_expires_at: null,
          last_success_at: null,
          last_failure_at: null,
          last_failure_reason: null,
          consecutive_failures: 0,
        },
        rate_limit: {
          interval_seconds: 30,
          last_request_at: null,
          wait_when_throttled: true,
        },
        web_search: { kind: 'copilot' as const, detail: null },
        copilot_service: {
          upstream_host: 'https://api.githubcopilot.com',
          github_api_base_url: 'https://api.github.com',
          token_endpoint: 'https://api.github.com/copilot_internal/v2/token',
          enterprise_domain: null,
          discovered_upstream: null,
        },
      })),
    },
    models: {
      list: vi.fn(async () => ({
        count: 2,
        loaded_at: null,
        models: [
          { vendor: 'Anthropic' },
          { vendor: 'OpenAI' },
        ],
      })),
    },
    apps: {
      list: vi.fn(async () => ({
        apps: [
          { name: 'Claude Code', enabled: true, status: 'ready' as const },
          { name: 'Copilot CLI', enabled: false, status: 'not-installed' as const },
        ],
      })),
    },
    connections: {
      list: vi.fn(async () => ({
        clients: [{ name: 'Claude Code', status: 'connected' as const }],
        manual_credentials: [],
        require_known_keys: true,
      })),
    },
    search: {
      get: vi.fn(async () => ({
        manifest: {
          id: 'search' as const,
          label: 'Search',
          description: '',
          fields: [
            {
              key: 'result_limit',
              label: 'Result limit',
              description: '',
              type: 'integer' as const,
            },
            {
              key: 'api_key',
              label: 'API key',
              description: '',
              type: 'secret' as const,
            },
          ],
          providers: [
            {
              id: 'copilot',
              label: 'Copilot Search',
              capabilities: ['search' as const],
            },
            {
              id: 'disabled',
              label: 'Disabled Search',
              capabilities: ['search' as const],
            },
          ],
        },
        settings: { result_limit: 10, api_key: 'must-not-render' },
        providers: {
          copilot: { enabled: true, settings: {}, secret_sources: {} },
          disabled: { enabled: false, settings: {}, secret_sources: {} },
        },
      })),
    },
  } as unknown as SettingsCapabilities
}

async function renderDiagnostics(capabilities: SettingsCapabilities): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <Tooltip.Provider>
        <DiagnosticsSection capabilities={capabilities} />
      </Tooltip.Provider>,
    )
    await Promise.resolve()
  })
  return container
}

describe('DiagnosticsSection', () => {
  it('shows a safe, readable summary of runtime and configured components', async () => {
    const surface = await renderDiagnostics(fakeCapabilities())

    expect(surface.textContent).toContain('1.2.3')
    expect(surface.textContent).toContain('abcdef0')
    expect(surface.textContent).toContain('1 day 1 hour')
    expect(surface.textContent).toContain('2 cached; Anthropic, OpenAI')
    expect(surface.textContent).toContain('Claude Code: enabled; Copilot CLI: not-installed')
    expect(surface.textContent).toContain('Claude Code: connected')
    expect(surface.textContent).toContain('Copilot Search')
    expect(surface.textContent).toContain('Result limit: 10')
    expect(surface.textContent).not.toContain('Disabled Search')
    expect(surface.textContent).not.toContain('must-not-render')
  })
})
