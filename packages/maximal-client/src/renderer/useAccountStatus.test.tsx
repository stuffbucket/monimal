import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MaximalQueryProvider } from './query-client'
import type { AuthStatus, SettingsCapabilities } from './settings/capabilities'
import { useAccountStatus } from './useAccountStatus'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function Status({ settings }: { settings: SettingsCapabilities }): ReactNode {
  const status = useAccountStatus(settings)
  return status?.state ?? 'loading'
}

function fakeCapabilities() {
  let notify = () => {}
  const status = vi.fn(async (): Promise<AuthStatus> => ({ state: 'unauthenticated' }))
  const settings = {
    account: { status },
    subscribe: vi.fn((listener: () => void) => {
      notify = listener
      return vi.fn()
    }),
  } as unknown as SettingsCapabilities

  return { notify: () => notify(), settings, status }
}

describe('useAccountStatus', () => {
  it('shares the cached sidecar request between consumers', async () => {
    const { settings, status } = fakeCapabilities()

    await act(async () => {
      root.render(
        <MaximalQueryProvider>
          <Status settings={settings} />
          <Status settings={settings} />
        </MaximalQueryProvider>,
      )
    })
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toBe('unauthenticatedunauthenticated')
      })
    })

    expect(status).toHaveBeenCalledTimes(1)
  })

  it('invalidates cached status when the sidecar publishes a change', async () => {
    const { notify, settings, status } = fakeCapabilities()
    await act(async () => {
      root.render(
        <MaximalQueryProvider>
          <Status settings={settings} />
        </MaximalQueryProvider>,
      )
    })
    status.mockResolvedValue({
      state: 'authenticated',
      account_login: 'octocat',
      account_type: 'individual',
    })

    await act(async () => {
      notify()
      await vi.waitFor(() => {
        expect(container.textContent).toBe('authenticated')
      })
    })

    expect(status).toHaveBeenCalledTimes(2)
  })
})
