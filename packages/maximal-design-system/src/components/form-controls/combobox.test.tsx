// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Combobox } from './combobox'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const groups = [
  {
    label: 'Recent',
    options: [
      {
        value: 'local',
        label: 'Local',
        textValue: 'Local',
        description: 'This computer',
        metadata: 'Recent',
        keywords: ['shell'],
      },
    ],
  },
  {
    label: 'Available',
    options: [
      {
        value: 'docker',
        label: 'Docker',
        textValue: 'Docker',
        description: 'Development container',
        keywords: ['container'],
      },
    ],
  },
] as const

let host: HTMLDivElement | undefined
let root: Root | undefined

type GroupedComboboxProps = Extract<
  Parameters<typeof Combobox>[0],
  { groups: readonly unknown[] }
>

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  document.body.replaceChildren()
  host = undefined
  root = undefined
})

function render(
  {
    groups: nextGroups = groups,
    inline = true,
    ...props
  }: Partial<Omit<GroupedComboboxProps, 'label'>> = {},
) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <Combobox
        {...props}
        groups={nextGroups}
        inline={inline}
        label="Terminal"
      />,
    )
  })
  const input = host.querySelector<HTMLInputElement>('[role="combobox"]')
  if (!input) throw new Error('Combobox did not render its input')
  return input
}

describe('Combobox', () => {
  it('renders grouped rich options and filters by keywords', () => {
    const input = render()
    const inlineSurface = host?.querySelector('.maximal-menu--search')

    expect(host?.querySelectorAll('.maximal-menu__group')).toHaveLength(2)
    expect(inlineSurface?.contains(input)).toBe(true)
    expect(inlineSurface?.querySelector('[role="listbox"]')).not.toBeNull()
    expect(host?.textContent).toContain('Development container')
    expect(host?.textContent).toContain('Recent')

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, 'container')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(host?.textContent).not.toContain('This computer')
    expect(host?.textContent).toContain('Docker')
  })

  it('selects the highlighted option with the keyboard', () => {
    const onValueChange = vi.fn()
    const input = render({ onValueChange })

    act(() => {
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'ArrowDown',
      }))
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
      }))
    })

    expect(onValueChange).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({ reason: 'item-press' }),
    )
  })

  it('lets Base UI resolve the input label from a controlled selection', () => {
    const input = render({ value: 'docker' })

    expect(input.value).toBe('Docker')
  })

  it('renders a popup inside the requested portal container', () => {
    const portal = document.createElement('div')
    document.body.append(portal)
    render({
      defaultOpen: true,
      groups,
      inline: false,
      container: portal,
    })

    expect(portal.querySelector('.maximal-combobox__popup')).not.toBeNull()
  })

  it('announces loading, empty, and error states', () => {
    render({ groups: [], loading: true, loadingMessage: 'Loading terminals...' })
    expect(host?.textContent).toContain('Loading terminals...')
    expect(host?.querySelectorAll('[role="option"]')).toHaveLength(1)

    act(() => {
      root?.render(
        <Combobox
          error="Terminals are unavailable."
          groups={[]}
          inline
          label="Terminal"
        />,
      )
    })
    expect(host?.textContent).toContain('Terminals are unavailable.')
    expect(host?.querySelector('[role="alert"]')).not.toBeNull()
    expect(host?.querySelector('[role="listbox"]')).toBeNull()
    expect(
      host?.querySelector('.maximal-menu--search')
        ?.querySelector('[role="combobox"]'),
    ).not.toBeNull()
  })
})
