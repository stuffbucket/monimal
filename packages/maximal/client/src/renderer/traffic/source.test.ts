import {
  TrafficOverviewQuerySchema,
  TrafficRequestListQuerySchema,
} from '@stuffbucket/maximal-observability-contract'
import { describe, expect, it, vi } from 'vitest'

import type { ControlResult } from '../../shared/bridge-types'
import { createObservabilitySource } from './source'

type Bridge = NonNullable<Parameters<typeof createObservabilitySource>[0]>

function unsupported(method: string): ControlResult<never> {
  return {
    ok: false,
    error: {
      reason: 'unsupported',
      message: `maximal-core does not advertise ${method}`,
      retryable: false,
    },
  }
}

function createBridge(): Bridge {
  return {
    observabilityOverview: vi.fn(async () =>
      unsupported('observability/overview'),
    ),
    observabilityRequests: vi.fn(async () =>
      unsupported('observability/requests'),
    ),
    observabilityRequest: vi.fn(async () =>
      unsupported('observability/request'),
    ),
    onTrafficInvalidation: vi.fn(() => () => {}),
  }
}

describe('observability source', () => {
  it('maps absent sidecar capabilities to explicit unsupported reads', async () => {
    const bridge = createBridge()
    const source = createObservabilitySource(bridge)

    await expect(
      source.readOverview(TrafficOverviewQuerySchema.parse({})),
    ).resolves.toEqual({
      status: 'unsupported',
      message: 'maximal-core does not advertise observability/overview',
    })
    await expect(
      source.readRequests(TrafficRequestListQuerySchema.parse({})),
    ).resolves.toEqual({
      status: 'unsupported',
      message: 'maximal-core does not advertise observability/requests',
    })
    await expect(
      source.readRequestDetail({ requestId: 'req-1' }),
    ).resolves.toEqual({
      status: 'unsupported',
      message: 'maximal-core does not advertise observability/request',
    })
  })

  it('returns the bridge unsubscribe unchanged', () => {
    const unsubscribe = vi.fn()
    const bridge = createBridge()
    bridge.onTrafficInvalidation = vi.fn(() => unsubscribe)
    const source = createObservabilitySource(bridge)
    const listener = vi.fn()

    expect(source.subscribeTrafficInvalidation(listener)).toBe(unsubscribe)
    expect(bridge.onTrafficInvalidation).toHaveBeenCalledWith(listener)
  })

  it('reports a request that disappeared between list and detail reads', async () => {
    const bridge = createBridge()
    bridge.observabilityRequest = vi.fn(async () => ({
      ok: true as const,
      value: null,
    }))
    const source = createObservabilitySource(bridge)

    await expect(
      source.readRequestDetail({ requestId: 'req-1' }),
    ).rejects.toThrow('The selected request is no longer available.')
  })
})
