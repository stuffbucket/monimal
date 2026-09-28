import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RendererErrorBoundary } from './RendererErrorBoundary'

function BrokenView(): never {
  throw new Error('render failed')
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('RendererErrorBoundary', () => {
  it('keeps a render failure recoverable from inside the window', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RendererErrorBoundary>
          <BrokenView />
        </RendererErrorBoundary>,
      )
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Maximal could not display this window',
    )
    expect(container.querySelector('button')?.textContent).toBe('Reload Window')
    expect(consoleError).toHaveBeenCalled()

    await act(async () => root.unmount())
  })
})
