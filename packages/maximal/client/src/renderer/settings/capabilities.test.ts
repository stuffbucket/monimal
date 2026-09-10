import type {
  AccountsListResponse,
  AuthStatus,
  TokenUsagePeriod,
} from '@stuffbucket/maximal-core/settings-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MaximalBridge } from '../../preload'
import type {
  ControlFailure,
  ControlResult,
  LifecycleStatus,
} from '../../shared/bridge-types'
import { ControlCallError } from '../shared/control-error'
import {
  createCoreSettingsCapabilities,
  createProxyUrlTracker,
} from './capabilities'

const authStatus: AuthStatus = { state: 'unauthenticated' }
const accounts: AccountsListResponse = { accounts: [], active_key: null }
const appEntry = {
  id: 'claude-code' as const,
  name: 'Claude Code',
  kind: 'config' as const,
  enabled: true,
  status: 'ready' as const,
  installs: [],
  install: null,
  conflict: null,
}
const apiKeyEntry = {
  id: 'key-1',
  label: 'Claude Code',
  key: 'testkey123',
  enabled: true,
  created_at: '2026-09-08T12:00:00.000Z',
}

function success<T>(value: T): ControlResult<T> {
  return { ok: true, value }
}

function failure<T>(error: ControlFailure): ControlResult<T> {
  return { ok: false, error }
}

function fakeBridge(): MaximalBridge {
  return {
    getCoreStatus: vi.fn(async (): Promise<LifecycleStatus> => ({
      phase: 'starting',
    })),
    getProxyUrl: vi.fn(async () => 'http://127.0.0.1:4141'),
    openExternal: vi.fn(async () => {}),
    onCoreStatus: vi.fn(() => () => {}),
    pendingSettingsRequest: vi.fn(async () => null),
    onOpenSettings: vi.fn(() => () => {}),
    logs: {
      location: vi.fn(async () => '/tmp/maximal/logs'),
      reveal: vi.fn(async () => {}),
    },
    menuBarMode: {
      get: vi.fn(async () => ({ enabled: false, pending: false })),
      beginEnable: vi.fn(async () => ({ attemptId: 'attempt-1', deadlineMs: 1 })),
      confirmEnable: vi.fn(async () => ({ enabled: true, pending: false })),
      cancelEnable: vi.fn(async () => ({ enabled: false, pending: false })),
      disable: vi.fn(async () => ({ enabled: false, pending: false })),
    },
    control: {
      authStatus: vi.fn(async () => success(authStatus)),
      authStart: vi.fn(async () => success(authStatus)),
      authCancel: vi.fn(async () => success(authStatus)),
      authSignOut: vi.fn(async () => success(null)),
      accountsList: vi.fn(async () => success(accounts)),
      accountsSwitch: vi.fn(async () => success(null)),
      observabilityOverview: vi.fn(),
      observabilityRequests: vi.fn(),
      observabilityRequest: vi.fn(),
      appsList: vi.fn(async () => success({ apps: [] })),
      appsSetEnabled: vi.fn(async () => success(appEntry)),
      apiKeysList: vi.fn(async () => success({ entries: [], enforcing: false })),
      apiKeysCreate: vi.fn(async () => success(apiKeyEntry)),
      apiKeysUpdate: vi.fn(async () => success(apiKeyEntry)),
      apiKeysRemove: vi.fn(async () => success(null)),
      apiKeysSetEnforcement: vi.fn(async (enforcing: boolean) =>
        success({ entries: [], enforcing }),
      ),
      modelsList: vi.fn(async () =>
        success({ models: [], count: 0, loaded_at: null }),
      ),
      modelsRefresh: vi.fn(async () =>
        success({ models: [], count: 0, loaded_at: null }),
      ),
      usageGet: vi.fn(async (period: TokenUsagePeriod) =>
        success({
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
        }),
      ),
      diagnosticsGet: vi.fn(async () =>
        success({
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
        }),
      ),
      onChange: vi.fn(() => () => {}),
      onTrafficInvalidation: vi.fn(() => () => {}),
    },
  }
}

beforeEach(() => {
  window.maximal = fakeBridge()
})

describe('createCoreSettingsCapabilities', () => {
  it('delegates every UI capability to its named bridge operation', async () => {
    const capabilities = createCoreSettingsCapabilities()

    expect(capabilities.kind).toBe('main-bridge')
    await expect(capabilities.account.status()).resolves.toEqual(authStatus)
    await expect(capabilities.account.start()).resolves.toEqual(authStatus)
    await expect(capabilities.account.cancel()).resolves.toEqual(authStatus)
    await expect(capabilities.account.signOut()).resolves.toBeUndefined()
    await expect(capabilities.accounts.list()).resolves.toEqual(accounts)
    await expect(
      capabilities.accounts.switchTo('github.com:octocat'),
    ).resolves.toBeUndefined()
    await expect(capabilities.connection.proxyUrl()).resolves.toBe(
      'http://127.0.0.1:4141',
    )
    await expect(capabilities.general.menuBarMode()).resolves.toEqual({
      enabled: false,
      pending: false,
    })
    await expect(capabilities.general.beginMenuBarOnly()).resolves.toEqual({
      attemptId: 'attempt-1',
      deadlineMs: 1,
    })
    await capabilities.general.confirmMenuBarOnly('attempt-1')
    await capabilities.general.cancelMenuBarOnly('attempt-1')
    await capabilities.general.disableMenuBarOnly()
    await expect(capabilities.apps.list()).resolves.toEqual({ apps: [] })
    await expect(
      capabilities.apps.setEnabled('claude-code', true),
    ).resolves.toEqual(appEntry)
    await expect(capabilities.apiKeys.list()).resolves.toEqual({
      entries: [],
      enforcing: false,
    })
    await expect(
      capabilities.apiKeys.create({ label: 'Claude Code' }),
    ).resolves.toEqual(apiKeyEntry)
    await expect(
      capabilities.apiKeys.update('key-1', { enabled: false }),
    ).resolves.toEqual(apiKeyEntry)
    await expect(capabilities.apiKeys.remove('key-1')).resolves.toBeUndefined()
    await expect(
      capabilities.apiKeys.setEnforcement(true),
    ).resolves.toEqual({ entries: [], enforcing: true })
    await expect(capabilities.models.list()).resolves.toMatchObject({ count: 0 })
    await expect(capabilities.models.refresh()).resolves.toMatchObject({ count: 0 })
    await expect(capabilities.usage.get('week')).resolves.toMatchObject({
      period: 'week',
    })
    await expect(capabilities.logs.location()).resolves.toBe('/tmp/maximal/logs')
    await expect(capabilities.logs.reveal()).resolves.toBeUndefined()
    await expect(capabilities.diagnostics.get()).resolves.toMatchObject({
      launch_kind: 'dev',
    })

    expect(window.maximal.control.authSignOut).toHaveBeenCalledOnce()
    expect(window.maximal.control.accountsSwitch).toHaveBeenCalledWith(
      'github.com:octocat',
    )
    expect(window.maximal.menuBarMode.get).toHaveBeenCalledOnce()
    expect(window.maximal.menuBarMode.beginEnable).toHaveBeenCalledOnce()
    expect(window.maximal.menuBarMode.confirmEnable).toHaveBeenCalledWith(
      'attempt-1',
    )
    expect(window.maximal.menuBarMode.cancelEnable).toHaveBeenCalledWith(
      'attempt-1',
    )
    expect(window.maximal.menuBarMode.disable).toHaveBeenCalledOnce()
    expect(window.maximal.control.appsSetEnabled).toHaveBeenCalledWith(
      'claude-code',
      true,
    )
    expect(window.maximal.control.apiKeysUpdate).toHaveBeenCalledWith(
      'key-1',
      { enabled: false },
    )
    expect(window.maximal.control.apiKeysRemove).toHaveBeenCalledWith('key-1')
    expect(window.maximal.control.usageGet).toHaveBeenCalledWith('week')

    const onChange = vi.fn()
    capabilities.subscribe(onChange)
    expect(window.maximal.control.onChange).toHaveBeenCalledWith(onChange)

    await capabilities.openExternal('https://github.com/login/device')
    expect(window.maximal.openExternal).toHaveBeenCalledWith(
      'https://github.com/login/device',
    )
  })

  it('subscribes before consuming and validates retained Settings requests', async () => {
    window.maximal.pendingSettingsRequest = vi.fn(async () => ({
      sectionId: 'settings-models-heading',
    }))
    const listener = vi.fn()
    const capabilities = createCoreSettingsCapabilities()

    capabilities.onOpenRequest(listener)
    await Promise.resolve()
    await Promise.resolve()

    expect(
      vi.mocked(window.maximal.onOpenSettings).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(window.maximal.pendingSettingsRequest).mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
    expect(listener).toHaveBeenCalledWith('settings-models-heading')
  })

  it('keeps live Settings delivery usable when retained-request consumption fails', async () => {
    let liveRequest: (sectionId: string | null) => void = () => {
      throw new Error('live listener was not installed')
    }
    window.maximal.onOpenSettings = vi.fn(
      (listener: (sectionId: string | null) => void) => {
        liveRequest = listener
        return () => {}
      },
    )
    window.maximal.pendingSettingsRequest = vi.fn(async () => {
      throw new Error('renderer was reloading')
    })
    const listener = vi.fn()
    const capabilities = createCoreSettingsCapabilities()

    capabilities.onOpenRequest(listener)
    await Promise.resolve()
    await Promise.resolve()
    liveRequest('settings-logs-heading')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('settings-logs-heading')
  })

  it('reconstructs preserved bridge failure fields as a local Error', async () => {
    window.maximal.control.authStatus = vi.fn(async () =>
      failure<AuthStatus>({
        reason: 'auth_fatal',
        message: 'Accept updated terms',
        retryable: false,
        code: 1002,
        requestId: 'req-123',
        remediationUrl: 'https://example.test/remediate',
      }),
    )
    const capabilities = createCoreSettingsCapabilities()

    const error = await capabilities.account.status().catch((cause: unknown) =>
      cause,
    )
    expect(error).toBeInstanceOf(ControlCallError)
    expect(error).toMatchObject({
      message: 'Accept updated terms',
      reason: 'auth_fatal',
      retryable: false,
      code: 1002,
      requestId: 'req-123',
      remediationUrl: 'https://example.test/remediate',
    })
  })
})

describe('createProxyUrlTracker', () => {
  it('resolves every pending reader when the seed arrives', async () => {
    let resolveSeed!: (url: string) => void
    const seed = new Promise<string>((resolve) => {
      resolveSeed = resolve
    })
    const tracker = createProxyUrlTracker(seed, {
      onCoreStatus: () => () => {},
    })

    const first = tracker.current()
    const second = tracker.current()
    resolveSeed('http://127.0.0.1:4141')

    await expect(Promise.all([first, second])).resolves.toEqual([
      'http://127.0.0.1:4141',
      'http://127.0.0.1:4141',
    ])
  })

  it('rejects readers already waiting when the seed fails', async () => {
    let rejectSeed!: (cause: unknown) => void
    const seed = new Promise<string>((_resolve, reject) => {
      rejectSeed = reject
    })
    const tracker = createProxyUrlTracker(seed, {
      onCoreStatus: () => () => {},
    })
    const current = tracker.current()
    const seedError = new Error('maximal-core is not available')

    rejectSeed(seedError)

    await expect(current).rejects.toBe(seedError)
  })

  it('ignores lifecycle events that are not ready', async () => {
    let emitLifecycle = (_status: LifecycleStatus): void => {
      throw new Error('Lifecycle listener was not registered')
    }
    const tracker = createProxyUrlTracker(new Promise<string>(() => {}), {
      onCoreStatus: (listener) => {
        emitLifecycle = listener
        return () => {}
      },
    })
    const current = tracker.current()

    emitLifecycle({ phase: 'starting' })
    emitLifecycle({
      phase: 'ready',
      proxyUrl: 'http://127.0.0.1:4142',
      pid: 42,
    })

    await expect(current).resolves.toBe('http://127.0.0.1:4142')
  })

  it('surfaces a failed seed and recovers when a later ready event arrives', async () => {
    let emitLifecycle = (_status: LifecycleStatus): void => {
      throw new Error('Lifecycle listener was not registered')
    }
    const seedError = new Error('maximal-core is not available')
    const tracker = createProxyUrlTracker(Promise.reject(seedError), {
      onCoreStatus: (listener) => {
        emitLifecycle = listener
        return () => {}
      },
    })

    await Promise.resolve()
    await expect(tracker.current()).rejects.toBe(seedError)

    emitLifecycle({
      phase: 'ready',
      proxyUrl: 'http://127.0.0.1:4142',
      pid: 42,
    })
    await expect(tracker.current()).resolves.toBe(
      'http://127.0.0.1:4142',
    )
  })

  it('keeps a newer ready value when the asynchronous seed resolves late', async () => {
    let resolveSeed!: (url: string) => void
    const seed = new Promise<string>((resolve) => {
      resolveSeed = resolve
    })
    let emitLifecycle = (_status: LifecycleStatus): void => {
      throw new Error('Lifecycle listener was not registered')
    }
    const tracker = createProxyUrlTracker(seed, {
      onCoreStatus: (listener) => {
        emitLifecycle = listener
        return () => {}
      },
    })

    emitLifecycle({
      phase: 'ready',
      proxyUrl: 'http://127.0.0.1:4142',
      pid: 42,
    })
    resolveSeed('http://127.0.0.1:4141')
    await seed
    await Promise.resolve()

    await expect(tracker.current()).resolves.toBe(
      'http://127.0.0.1:4142',
    )
  })
})
