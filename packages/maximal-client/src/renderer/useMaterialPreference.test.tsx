import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMaximalQueryClient } from './query-client'
import type {
  MaterialPreference,
  PersistedMaterialPreference,
} from './material-preference'
import { useMaterialPreference } from './useMaterialPreference'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const persisted: PersistedMaterialPreference = {
  preset: 'clouds',
  quality: 'balanced',
  strength: 0.75,
  motion: 0.5,
  lighting: 'fixed',
  timezone: 'UTC',
  solarFacingOffset: 0,
  solarFollowStrength: 0.5,
  solarEffect: 'atmospheric',
}

let container: HTMLElement
let root: Root
let queryClient: QueryClient
let current: ReturnType<typeof useMaterialPreference> | null

function Probe({
  capabilities,
}: {
  capabilities: Parameters<typeof useMaterialPreference>[0]
}) {
  current = useMaterialPreference(capabilities)
  return null
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  queryClient = createMaximalQueryClient()
  current = null
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('useMaterialPreference', () => {
  it('persists durable fields while retaining coordinates in the query cache', async () => {
    let notify: ((next: PersistedMaterialPreference) => void) | undefined
    const general = {
      material: vi.fn(async () => persisted),
      setMaterial: vi.fn(async (next: PersistedMaterialPreference) => next),
      onMaterialChange: vi.fn(
        (listener: (next: PersistedMaterialPreference) => void) => {
          notify = listener
          return vi.fn()
        },
      ),
    }
    const capabilities = { general }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe capabilities={capabilities} />
        </QueryClientProvider>,
      )
      await vi.waitFor(() => expect(current?.state).not.toBeNull())
    })

    const next: MaterialPreference = {
      ...persisted,
      preset: 'water',
      latitude: 37.7749,
      longitude: -122.4194,
    }
    await act(async () => {
      await current?.set(next)
      await vi.waitFor(() => expect(current?.state).toEqual(next))
    })

    expect(general.setMaterial).toHaveBeenCalledWith({
      ...persisted,
      preset: 'water',
    })
    await act(async () => {
      notify?.({ ...persisted, quality: 'high' })
      await vi.waitFor(() =>
        expect(current?.state?.quality).toBe('high'),
      )
    })
    expect(current?.state).toEqual({
      ...persisted,
      quality: 'high',
      latitude: 37.7749,
      longitude: -122.4194,
    })
  })
})
