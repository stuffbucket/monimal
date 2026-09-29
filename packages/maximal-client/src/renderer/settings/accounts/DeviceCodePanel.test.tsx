import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DeviceCodePanel } from './DeviceCodePanel'

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

async function renderPanel(
  onCopyAndOpen = vi.fn(),
  busy = false,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <DeviceCodePanel
        status={{
          user_code: '1234-ABCD',
          verification_uri: 'https://github.com/login/device',
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        }}
        busy={busy}
        onCopyAndOpen={onCopyAndOpen}
        onCancel={() => undefined}
        onRequestNewCode={() => undefined}
      />,
    )
  })
  return container
}

describe('DeviceCodePanel', () => {
  it('delegates copy and browser launch from the code button', async () => {
    const onCopyAndOpen = vi.fn()
    const surface = await renderPanel(onCopyAndOpen)
    const code = surface.querySelector<HTMLButtonElement>(
      '.settings-device-code__code',
    )
    if (code === null) throw new Error('device code button was not rendered')

    await act(async () => code.click())

    expect(onCopyAndOpen).toHaveBeenCalledOnce()
  })

  it('presents the combined copy and browser instruction without a link', async () => {
    const surface = await renderPanel()
    expect(surface.textContent).toContain(
      'Click to copy to clipboard and open browser window.',
    )
    expect(surface.textContent).not.toContain('https://github.com/login/device')
  })

  it('disables code activation while an account action is busy', async () => {
    const onCopyAndOpen = vi.fn()
    const surface = await renderPanel(onCopyAndOpen, true)
    const code = surface.querySelector<HTMLButtonElement>(
      '.settings-device-code__code',
    )
    if (code === null) throw new Error('device code button was not rendered')

    await act(async () => code.click())

    expect(code.disabled).toBe(true)
    expect(onCopyAndOpen).not.toHaveBeenCalled()
  })
})
