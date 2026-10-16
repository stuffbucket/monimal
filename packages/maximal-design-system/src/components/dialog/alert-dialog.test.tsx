// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '../../primitives/button'
import {
  AlertDialog,
  type AlertDialogAcknowledgementProps,
  type AlertDialogConfirmationProps,
  type AlertDialogProps,
} from './index'

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

function mount(props: AlertDialogProps) {
  host ??= document.createElement('div')
  document.body.append(host)
  root ??= createRoot(host)
  act(() => {
    root?.render(<AlertDialog {...props} />)
  })
}

const common = {
  onOpenChange: () => undefined,
  open: true,
  popupProps: { 'data-testid': 'alert' },
}

function render(props: Partial<AlertDialogConfirmationProps> = {}) {
  mount({
    ...common,
    action: <Button variant="danger">Delete</Button>,
    description: 'This removes the project and everything in it.',
    title: 'Delete this project?',
    ...props,
  })
}

function renderAcknowledgement(props: Partial<AlertDialogAcknowledgementProps> = {}) {
  mount({
    ...common,
    description: 'Another window removed this project while you were editing it.',
    title: 'Project no longer exists',
    ...props,
  })
}

function buttonLabelled(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === label)
  if (button === undefined) throw new Error(`Missing ${label} button`)
  return button
}

function popup(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-testid="alert"]')
  if (element === null) throw new Error('Alert dialog did not render')
  return element
}

function cancelButton(): HTMLButtonElement {
  return buttonLabelled('Cancel')
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    )
  })
}

describe('AlertDialog', () => {
  it('is a modal alertdialog named and described by visible text', () => {
    render()

    const title = document.querySelector('.maximal-dialog__title')
    const description = document.querySelector('.maximal-dialog__description')

    expect(popup().getAttribute('role')).toBe('alertdialog')
    expect(popup().getAttribute('aria-modal')).toBe('true')
    expect(popup().getAttribute('aria-labelledby')).toBe(title?.id)
    expect(popup().getAttribute('aria-describedby')).toBe(description?.id)
    expect(title?.classList).not.toContain('maximal-visually-hidden')
    expect(description?.classList).not.toContain('maximal-visually-hidden')
    expect(popup().classList).toContain('maximal-alert-dialog')
    expect(document.querySelector('[aria-label="Close dialog"]')).toBeNull()
  })

  it('places cancel first, tertiary responses next, and the primary response last', () => {
    render({
      // Passed out of visual order to prove the slots, not the caller, decide it.
      action: <Button variant="primary">Save</Button>,
      tertiaryActions: <Button variant="secondary-danger">Discard</Button>,
    })

    const labels = [...document.querySelectorAll('.maximal-alert-dialog__actions button')]
      .map((button) => button.textContent)
    expect(labels).toEqual(['Cancel', 'Discard', 'Save'])
  })

  it('cancels through the cancel control and Escape', () => {
    const onOpenChange = vi.fn()
    const onCancel = vi.fn()
    render({ cancelLabel: 'Cancel', onCancel, onOpenChange })

    act(() => cancelButton().click())
    pressEscape()

    expect(onOpenChange.mock.calls).toEqual([[false], [false]])
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('starts focus on cancel, the least destructive response', async () => {
    render({ children: <a href="#details">What is removed</a> })

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(cancelButton())
    })
  })
  it('ignores presses outside the popup', () => {
    const onOpenChange = vi.fn()
    render({ onOpenChange })

    const backdrop = document.querySelector('.maximal-dialog__backdrop')
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('blocks every dismissal while a response is pending', () => {
    const onOpenChange = vi.fn()
    const onCancel = vi.fn()
    render({ onCancel, onOpenChange, pending: true })

    expect(popup().getAttribute('aria-busy')).toBe('true')
    expect(cancelButton().disabled || cancelButton().getAttribute('aria-disabled') === 'true')
      .toBe(true)

    pressEscape()
    act(() => cancelButton().click())

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('announces a failed response as an alert', () => {
    render({ error: 'The project could not be deleted.' })

    expect(document.querySelector('.maximal-alert-dialog__error[role="alert"]')?.textContent)
      .toBe('The project could not be deleted.')
  })

  it('omits the busy state and error when idle', () => {
    render()

    expect(popup().hasAttribute('aria-busy')).toBe(false)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('offers only OK when the user can only acknowledge the outcome', async () => {
    const onOpenChange = vi.fn()
    const onAcknowledge = vi.fn()
    renderAcknowledgement({ onAcknowledge, onOpenChange })

    const labels = [...document.querySelectorAll('.maximal-alert-dialog__actions button')]
      .map((button) => button.textContent)
    expect(labels).toEqual(['OK'])
    expect(popup().getAttribute('role')).toBe('alertdialog')
    expect(buttonLabelled('OK').getAttribute('data-variant')).toBe('primary')
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(buttonLabelled('OK'))
    })

    act(() => buttonLabelled('OK').click())
    pressEscape()

    expect(onOpenChange.mock.calls).toEqual([[false], [false]])
    expect(onAcknowledge).toHaveBeenCalledTimes(2)
  })

  it('names the acknowledgement control when asked', () => {
    renderAcknowledgement({ acknowledgeLabel: 'Close' })

    expect(buttonLabelled('Close').getAttribute('data-variant')).toBe('primary')
  })

  it('keeps cancel secondary in a confirmation', () => {
    render()

    expect(cancelButton().getAttribute('data-variant')).toBe('secondary')
  })
})
