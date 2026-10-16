// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuSubmenu,
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

describe('overlays', () => {
  it('forwards popup attributes to the portalled element', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root?.render(
        <MenuRoot
          open
          popupProps={{ 'data-testid': 'menu' }}
          trigger={<button type="button">Actions</button>}
        >
          <MenuItem>Open</MenuItem>
        </MenuRoot>,
      )
    })

    expect(document.querySelector('[data-testid="menu"]')?.getAttribute('role'))
      .toBe('menu')
    expect(host.querySelector('[data-testid="menu"]')).toBeNull()
  })

  it('composes rich rows, groups, selection, dividers, and submenus', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root?.render(
        <MenuRoot
          defaultOpen
          popupProps={{ 'data-testid': 'menu' }}
          trigger={<button type="button">Actions</button>}
        >
          <MenuGroup label="View">
            <MenuCheckboxItem
              defaultChecked
              indicatorPosition="trailing"
              leading={<span>Icon</span>}
              trailing="⌘P"
            >
              Pixel preview
            </MenuCheckboxItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuSubmenu label="Move to">
            <MenuItem>Personal</MenuItem>
          </MenuSubmenu>
        </MenuRoot>,
      )
    })

    const menu = document.querySelector('[data-testid="menu"]')
    expect(menu?.textContent).toContain('View')
    expect(menu?.textContent).toContain('IconPixel preview⌘P')
    expect(menu?.querySelector('[role="menuitemcheckbox"]')?.getAttribute('aria-checked'))
      .toBe('true')
    expect(menu?.querySelector('.maximal-menu__separator')).not.toBeNull()
    expect(menu?.querySelector('[aria-haspopup="menu"]')?.textContent)
      .toContain('Move to')
  })

  it('styles the search variant without imposing menu semantics', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root?.render(<Menu data-testid="surface" variant="search">Search</Menu>)
    })

    const surface = host.querySelector('[data-testid="surface"]')
    expect(surface?.classList).toContain('maximal-menu--search')
    expect(surface?.getAttribute('role')).toBeNull()
  })
})
