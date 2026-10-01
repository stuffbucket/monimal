// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  UnitValueInput,
  type MeasurementUnit,
} from '../src/renderer/components/controls/UnitValueInput'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const units: MeasurementUnit<'percent' | 'em'>[] = [
  {
    value: 'percent',
    label: '%',
    step: 1,
    fromCanonical: (value) => value + 100,
    toCanonical: (value) => value - 100,
  },
  {
    value: 'em',
    label: 'em',
    step: 0.01,
    fromCanonical: (value) => 1 + (value / 100),
    toCanonical: (value) => (value - 1) * 100,
  },
]

let container: HTMLDivElement
let root: Root

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  container.className = 'sb-shell'
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('UnitValueInput', () => {
  it('normalizes typed units, persists presentation, and restores Auto on clear', () => {
    const onCommit = vi.fn()
    act(() => {
      root.render(
        <UnitValueInput
          label="Line height"
          value={0}
          units={units}
          defaultUnit="percent"
          autoValue={0}
          canonicalStep={0.1}
          storageKey="test.line-height"
          onCommit={onCommit}
        />,
      )
    })
    const input = container.querySelector('input')
    const unit = container.querySelector('select')
    if (input === null || unit === null) throw new Error('control did not render')

    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Auto')

    act(() => {
      input.focus()
      setValue(input, '1.2em')
      input.blur()
    })
    expect(onCommit).toHaveBeenLastCalledWith(20)
    expect(unit.value).toBe('em')
    expect(localStorage.getItem('test.line-height')).toBe('em|manual')

    act(() => {
      input.focus()
      setValue(input, '')
      input.blur()
    })
    expect(onCommit).toHaveBeenLastCalledWith(0)
    expect(input.placeholder).toBe('Auto')
    expect(localStorage.getItem('test.line-height')).toBe('em|auto')
  })

  it('keeps invalid drafts visible and reports the error', () => {
    act(() => {
      root.render(
        <UnitValueInput
          label="Line height"
          value={0}
          units={units}
          defaultUnit="percent"
          autoValue={0}
          onCommit={vi.fn()}
        />,
      )
    })
    const input = container.querySelector('input')
    if (input === null) throw new Error('control did not render')

    act(() => {
      input.focus()
      setValue(input, 'wide')
      input.blur()
    })

    expect(input.value).toBe('wide')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('Enter a number')
  })
})
