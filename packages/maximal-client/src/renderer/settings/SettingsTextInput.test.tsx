// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsTextInput } from './SettingsTextInput'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

function renderInput(onValueChange = vi.fn()) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <SettingsTextInput
        available
        label="API key"
        onValueChange={onValueChange}
        revealLabel="API key"
        secret
        value="secret"
      />,
    )
  })
  return { host, onValueChange }
}

describe('SettingsTextInput', () => {
  it('reveals secrets without changing their value', () => {
    const { host } = renderInput()
    const input = host.querySelector<HTMLInputElement>('input')
    const reveal = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Show API key"]',
    )

    expect(input?.type).toBe('password')
    expect(host.textContent).toContain('Available')
    act(() => reveal?.click())
    expect(input?.type).toBe('text')
    expect(input?.value).toBe('secret')
    expect(host.querySelector('button')?.getAttribute('aria-label'))
      .toBe('Hide API key')
  })

  it('reports input values rather than DOM events', () => {
    const { host, onValueChange } = renderInput()
    const input = host.querySelector<HTMLInputElement>('input')
    if (input === null) throw new Error('Expected settings input')

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, 'next')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenCalledWith('next')
  })
})
