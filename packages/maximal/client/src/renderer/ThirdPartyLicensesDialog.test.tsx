import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getLicenseText, openLicenses } = vi.hoisted(() => ({
  getLicenseText: vi.fn(() => Promise.resolve('Example dependency\nLicense: MIT')),
  openLicenses: { listener: null as null | (() => void) },
}))

vi.mock('stuffbucket-electron/renderer', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? (
    <div role="dialog">{children}</div>
  ) : null,
}))

const { ThirdPartyLicensesDialog } = await import('./ThirdPartyLicensesDialog')

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  openLicenses.listener = null
  getLicenseText.mockClear()
  Object.assign(window, {
    maximal: {
      licenses: { text: getLicenseText },
      onOpenLicenses: (listener: () => void) => {
        openLicenses.listener = listener
        return () => {
          openLicenses.listener = null
        }
      },
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

describe('ThirdPartyLicensesDialog', () => {
  it('opens from the application menu and keeps notices inside its reader', async () => {
    if (root === null || container === null) throw new Error('Test root is not ready')
    const mountedRoot = root
    await act(async () => {
      mountedRoot.render(<ThirdPartyLicensesDialog />)
    })
    if (openLicenses.listener === null) throw new Error('License menu listener was not installed')

    await act(async () => {
      openLicenses.listener?.()
      await Promise.resolve()
    })

    expect(getLicenseText).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Example dependency')
    expect(container.querySelector('.license-dialog__reader')).not.toBeNull()
    expect(container.querySelector('.license-dialog__text')?.tagName).toBe('PRE')

    const close = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close',
    )
    if (close === undefined) throw new Error('Close button was not rendered')
    act(() => close.click())

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})