import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DeviceCodePanel } from './DeviceCodePanel'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null
const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  writeText.mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

async function renderPanel(onOpenVerification = vi.fn()): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <DeviceCodePanel
        status={{
          user_code: '1234-ABCD',
          verification_uri: 'https://github.com/login/device',
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        }}
        busy={false}
        onOpenVerification={onOpenVerification}
        onCancel={() => undefined}
        onRequestNewCode={() => undefined}
      />,
    )
  })
  return container
}

describe('DeviceCodePanel', () => {
  it('copies the code from the code area and confirms the interaction', async () => {
    const surface = await renderPanel()
    const code = surface.querySelector<HTMLButtonElement>(
      '.settings-device-code__code',
    )
    if (code === null) throw new Error('device code button was not rendered')

    await act(async () => code.click())

    expect(writeText).toHaveBeenCalledWith('1234-ABCD')
    expect(surface.textContent).toContain('(Copied to clipboard)')
  })

  it('keeps browser launch in the instruction below the code', async () => {
    const onOpenVerification = vi.fn()
    const surface = await renderPanel(onOpenVerification)
    expect(surface.textContent).toContain(
      'Click on the code above to copy it to your clipboard and launch sign in on your browser.',
    )
    const launch = [...surface.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'launch sign in on your browser.',
    )
    if (launch === undefined) throw new Error('browser launch was not rendered')

    act(() => launch.click())

    expect(onOpenVerification).toHaveBeenCalledOnce()
  })

  it('surfaces clipboard failures without claiming the copy succeeded', async () => {
    writeText.mockRejectedValue(new Error('clipboard denied'))
    const surface = await renderPanel()
    const code = surface.querySelector<HTMLButtonElement>(
      '.settings-device-code__code',
    )
    if (code === null) throw new Error('device code button was not rendered')

    await act(async () => code.click())

    expect(surface.textContent).toContain(
      'Could not copy the code to your clipboard.',
    )
    expect(surface.textContent).not.toContain('(Copied to clipboard)')
  })
})
