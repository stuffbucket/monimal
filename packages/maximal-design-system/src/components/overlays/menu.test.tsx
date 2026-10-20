// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { MenuItem, MenuRoot } from './menu'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement | undefined
let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
  host = undefined
  root = undefined
})

function press(target: HTMLElement, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  })
}

function renderMenu() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <MenuRoot defaultOpen trigger={<button type="button">Open</button>}>
        <MenuItem>First</MenuItem>
        <MenuItem>Middle</MenuItem>
        <MenuItem>Last</MenuItem>
      </MenuRoot>,
    )
  })

  const menu = document.querySelector<HTMLElement>('[role="menu"]')
  const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  if (menu === null || items.length !== 3) throw new Error('Menu did not render')
  return { menu, items }
}

describe('MenuRoot', () => {
  it('stops keyboard navigation at the first and last items', () => {
    const { menu, items } = renderMenu()
    menu.focus()

    press(menu, 'Home')
    expect(items[0]?.hasAttribute('data-highlighted')).toBe(true)
    press(menu, 'ArrowUp')
    expect(items[0]?.hasAttribute('data-highlighted')).toBe(true)
    expect(items[2]?.hasAttribute('data-highlighted')).toBe(false)

    press(menu, 'End')
    expect(items[2]?.hasAttribute('data-highlighted')).toBe(true)
    press(menu, 'ArrowDown')
    expect(items[2]?.hasAttribute('data-highlighted')).toBe(true)
    expect(items[0]?.hasAttribute('data-highlighted')).toBe(false)
  })
})
