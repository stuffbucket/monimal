import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppearancePreference, SettingsCapabilities } from '../capabilities'
import { useAppearancePreference } from './useAppearancePreference'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const defaultPreference: AppearancePreference = {
  vibrancyEnabled: false,
  vibrancySupported: true,
  backgroundEffectsEnabled: false,
  reducedMotionEnabled: false,
}

let container: HTMLElement
let root: Root
let current: ReturnType<typeof useAppearancePreference> | null

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function capabilities(overrides: Partial<SettingsCapabilities['general']> = {}) {
  const general = {
    appearance: vi.fn(async () => defaultPreference),
    onAppearanceChange: vi.fn(() => vi.fn()),
    setVibrancyEnabled: vi.fn(async (enabled: boolean) => ({
      ...defaultPreference,
      vibrancyEnabled: enabled,
    })),
    setBackgroundEffectsEnabled: vi.fn(async (enabled: boolean) => ({
      ...defaultPreference,
      backgroundEffectsEnabled: enabled,
    })),
    setReducedMotionEnabled: vi.fn(async (enabled: boolean) => ({
      ...defaultPreference,
      reducedMotionEnabled: enabled,
    })),
    ...overrides,
  }
  return {
    value: { general } as unknown as SettingsCapabilities,
    general,
  }
}

function Probe({ value }: { value: SettingsCapabilities }) {
  current = useAppearancePreference(value)
  return null
}

async function render(value: SettingsCapabilities): Promise<void> {
  await act(async () => {
    root.render(<Probe value={value} />)
    await Promise.resolve()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  current = null
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('useAppearancePreference', () => {
  it('keeps a subscription update that arrives before the initial read', async () => {
    const initial = deferred<AppearancePreference>()
    const unsubscribe = vi.fn()
    let notify: ((next: AppearancePreference) => void) | null = null
    const { value } = capabilities({
      appearance: vi.fn(() => initial.promise),
      onAppearanceChange: vi.fn((listener: (next: AppearancePreference) => void) => {
        notify = listener
        return unsubscribe
      }),
    })
    await render(value)

    const changed = { ...defaultPreference, backgroundEffectsEnabled: true }
    act(() => notify?.(changed))
    await act(async () => {
      initial.resolve(defaultPreference)
      await initial.promise
    })

    expect(current?.state).toEqual(changed)
    expect(current?.error).toBeNull()
    act(() => root.unmount())
    expect(unsubscribe).toHaveBeenCalledOnce()
    root = createRoot(container)
  })

  it('reports a load failure and clears it on a subscription update', async () => {
    let notify: ((next: AppearancePreference) => void) | null = null
    const { value } = capabilities({
      appearance: vi.fn(async () => {
        throw new Error('appearance unavailable')
      }),
      onAppearanceChange: vi.fn((listener: (next: AppearancePreference) => void) => {
        notify = listener
        return vi.fn()
      }),
    })
    await render(value)

    expect(current?.error).toBe('appearance unavailable')
    act(() => notify?.(defaultPreference))
    expect(current?.state).toEqual(defaultPreference)
    expect(current?.error).toBeNull()
  })

  it('ignores an initial-read failure after unmount', async () => {
    const initial = deferred<AppearancePreference>()
    const { value } = capabilities({
      appearance: vi.fn(() => initial.promise),
    })
    await render(value)
    act(() => root.unmount())

    await act(async () => {
      initial.reject(new Error('late failure'))
      await initial.promise.catch(() => undefined)
    })
    expect(current?.error).toBeNull()
    root = createRoot(container)
  })

  it('sets busy state and stores successful visual preference updates', async () => {
    const background = deferred<AppearancePreference>()
    const { value, general } = capabilities({
      setBackgroundEffectsEnabled: vi.fn(() => background.promise),
    })
    await render(value)

    let updating!: Promise<void>
    act(() => {
      updating = current!.setBackgroundEffectsEnabled(true)
    })
    expect(current?.busy).toBe(true)
    expect(current?.error).toBeNull()

    const changed = { ...defaultPreference, backgroundEffectsEnabled: true }
    await act(async () => {
      background.resolve(changed)
      await updating
    })
    expect(general.setBackgroundEffectsEnabled).toHaveBeenCalledWith(true)
    expect(current?.state).toEqual(changed)
    expect(current?.busy).toBe(false)
  })

  it('reports setter failures and always clears busy state', async () => {
    const update = deferred<AppearancePreference>()
    const { value } = capabilities({
      appearance: vi.fn(async () => {
        throw new Error('initial failure')
      }),
      setReducedMotionEnabled: vi.fn(() => update.promise),
    })
    await render(value)
    expect(current?.error).toBe('initial failure')

    let updating!: Promise<void>
    act(() => {
      updating = current!.setReducedMotionEnabled(true)
    })
    expect(current?.busy).toBe(true)
    expect(current?.error).toBeNull()
    await act(async () => {
      update.reject(new Error('motion update failed'))
      await updating
    })

    expect(current?.error).toBe('motion update failed')
    expect(current?.busy).toBe(false)
    expect(current?.state).toBeNull()
  })

  it('uses replacement capabilities for subscriptions and setters', async () => {
    const firstUnsubscribe = vi.fn()
    const first = capabilities({
      onAppearanceChange: vi.fn(() => firstUnsubscribe),
    })
    const second = capabilities()
    await render(first.value)
    await render(second.value)

    expect(firstUnsubscribe).toHaveBeenCalledOnce()
    await act(async () => current!.setVibrancyEnabled(true))
    await act(async () => current!.setBackgroundEffectsEnabled(true))
    await act(async () => current!.setReducedMotionEnabled(true))
    expect(first.general.setVibrancyEnabled).not.toHaveBeenCalled()
    expect(first.general.setBackgroundEffectsEnabled).not.toHaveBeenCalled()
    expect(first.general.setReducedMotionEnabled).not.toHaveBeenCalled()
    expect(second.general.setVibrancyEnabled).toHaveBeenCalledWith(true)
    expect(second.general.setBackgroundEffectsEnabled).toHaveBeenCalledWith(true)
    expect(second.general.setReducedMotionEnabled).toHaveBeenCalledWith(true)
    expect(current?.state?.reducedMotionEnabled).toBe(true)
  })
})
