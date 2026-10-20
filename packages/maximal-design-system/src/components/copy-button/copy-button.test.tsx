// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CopyButton } from './index'

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function render(writeText: (text: string) => Promise<void>, onCopied = vi.fn()) {
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<CopyButton about="the log path" onCopied={onCopied} text="/logs" />))
  const button = host.querySelector('button')
  if (button === null) throw new Error('CopyButton did not render')
  return { button, onCopied }
}

describe('CopyButton', () => {
  it('copies its text, confirms, and returns to rest', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(() => Promise.resolve())
    const { button, onCopied } = render(writeText)

    expect(button.getAttribute('aria-label')).toBe('Copy the log path')
    await act(async () => {
      button.click()
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('/logs')
    expect(onCopied).toHaveBeenCalledOnce()
    expect(button.getAttribute('aria-label')).toBe('Copied the log path')
    expect(button.hasAttribute('data-copied')).toBe(true)

    act(() => vi.advanceTimersByTime(1500))
    expect(button.getAttribute('aria-label')).toBe('Copy the log path')
  })

  it('does not claim success when the clipboard rejects', async () => {
    const { button, onCopied } = render(() => Promise.reject(new Error('denied')))

    await act(async () => {
      button.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onCopied).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-label')).toBe('Copy the log path')
  })
})
