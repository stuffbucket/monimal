// @vitest-environment jsdom
import { SearchIcon } from '../../icons'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TextInput } from './text-input'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement | undefined
let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  host = undefined
  root = undefined
})

function render(props: Partial<Parameters<typeof TextInput>[0]> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <TextInput
        label="Search commands"
        {...props}
      />,
    )
  })
  const input = host.querySelector('input')
  if (!input) throw new Error('TextInput did not render an input')
  return input
}

describe('TextInput', () => {
  it('associates its label, description, and error with the Base UI input', () => {
    const input = render({
      description: 'Search by command name.',
      error: 'Enter at least two characters.',
      leading: <SearchIcon />,
      showLabel: false,
    })

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-labelledby')).toBe(
      host?.querySelector('label')?.id,
    )
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(describedBy).toContain(host?.querySelector('.maximal-field-description')?.id)
    expect(describedBy).toContain(host?.querySelector('.maximal-field-error')?.id)
    expect(host?.querySelector('label')?.classList).toContain('maximal-visually-hidden')
    expect(host?.querySelector('.maximal-text-input__adornment')).not.toBeNull()
  })

  it('supports controlled values through onValueChange', () => {
    const onValueChange = vi.fn()
    const input = render({ onValueChange, value: 'open' })

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, 'open terminal')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenCalledWith(
      'open terminal',
      expect.objectContaining({ reason: 'none' }),
    )
  })

  it('forwards native input state and attributes', () => {
    const input = render({
      disabled: true,
      placeholder: 'Search',
      required: true,
      type: 'search',
    })

    expect(input.disabled).toBe(true)
    expect(input.required).toBe(true)
    expect(input.getAttribute('type')).toBe('search')
    expect(input.getAttribute('placeholder')).toBe('Search')
  })
})
