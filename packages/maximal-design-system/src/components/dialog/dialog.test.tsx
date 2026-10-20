// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dialog } from './index'

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
})

function renderDialog(
  props: Partial<Parameters<typeof Dialog>[0]> = {},
) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <Dialog
        description="A permanent action."
        onOpenChange={() => undefined}
        open
        title="Delete project"
        {...props}
      >
        <button type="button">Cancel</button>
      </Dialog>,
    )
  })
}

describe('Dialog', () => {
  it('renders an accessible Base UI modal with hidden naming content', () => {
    renderDialog({ popupProps: { 'data-testid': 'dialog' } })

    const popup = document.querySelector('[data-testid="dialog"]')
    const title = document.querySelector('.maximal-dialog__title')
    const description = document.querySelector('.maximal-dialog__description')

    expect(popup?.getAttribute('role')).toBe('dialog')
    expect(popup?.getAttribute('aria-modal')).toBe('true')
    expect(popup?.getAttribute('aria-labelledby')).toBe(title?.id)
    expect(popup?.getAttribute('aria-describedby')).toBe(description?.id)
    expect(title?.classList).toContain('maximal-visually-hidden')
    expect(description?.classList).toContain('maximal-visually-hidden')
    expect(document.querySelector('.maximal-dialog__backdrop')).not.toBeNull()
    expect(document.querySelector('.maximal-dialog__viewport')).not.toBeNull()
    expect(document.querySelector('[aria-label="Close dialog"]')).not.toBeNull()
  })

  it('shows title and description when requested', () => {
    renderDialog({ showDescription: true, showTitle: true })

    expect(document.querySelector('.maximal-dialog__title')?.classList)
      .not.toContain('maximal-visually-hidden')
    expect(document.querySelector('.maximal-dialog__description')?.classList)
      .not.toContain('maximal-visually-hidden')
  })

  it('closes on Escape unless the consumer prevents it', () => {
    const onOpenChange = vi.fn()
    renderDialog({ onOpenChange })

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Escape',
        }),
      )
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)

    onOpenChange.mockClear()
    act(() => {
      root?.render(
        <Dialog
          onEscapeKeyDown={(event) => event.preventDefault()}
          onOpenChange={onOpenChange}
          open
          title="Delete project"
        >
          <button type="button">Cancel</button>
        </Dialog>,
      )
    })
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Escape',
        }),
      )
    })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
