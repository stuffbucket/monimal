import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthStatus, SettingsCapabilities } from './capabilities'
import { AccountSection } from './AccountSection'

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

function fakeCapabilities() {
  let notify = () => {}
  let resolveStart: (status: AuthStatus) => void = () => {}
  const account = {
    status: vi.fn(async (): Promise<AuthStatus> => ({ state: 'unauthenticated' })),
    start: vi.fn(
      () =>
        new Promise<AuthStatus>((resolve) => {
          resolveStart = resolve
        }),
    ),
    cancel: vi.fn(),
    signOut: vi.fn(),
  }
  const capabilities = {
    account,
    accounts: {
      list: vi.fn(async () => ({ accounts: [], active_key: null })),
      switchTo: vi.fn(),
    },
    subscribe: vi.fn((listener: () => void) => {
      notify = listener
      return () => {}
    }),
  } as unknown as SettingsCapabilities

  return {
    account,
    capabilities,
    notify: () => notify(),
    resolveStart: (status: AuthStatus) => resolveStart(status),
  }
}

async function renderAccount(capabilities: SettingsCapabilities): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(<AccountSection capabilities={capabilities} />)
    await Promise.resolve()
  })
  return container
}

describe('AccountSection refresh ownership', () => {
  it('ignores capability refreshes while an account action is in flight', async () => {
    const { account, capabilities, notify, resolveStart } = fakeCapabilities()
    const surface = await renderAccount(capabilities)
    const signIn = [...surface.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Sign in with GitHub',
    )
    if (signIn === undefined) throw new Error('sign-in button was not rendered')

    act(() => signIn.click())
    await act(async () => {
      notify()
      await Promise.resolve()
    })

    expect(account.status).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveStart({ state: 'unauthenticated' })
      await Promise.resolve()
    })
    await act(async () => {
      notify()
      await Promise.resolve()
    })

    expect(account.status).toHaveBeenCalledTimes(2)
  })
})