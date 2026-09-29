import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppTab } from '../frame/AppFrame'
import { WorkspaceMap } from './WorkspaceMap'

const terminal: AppTab = {
  id: 'terminal:one',
  title: 'Build terminal',
  icon: 'terminal',
  kind: 'terminal',
  closable: true,
  sessionId: 'pty:one',
}

let container: HTMLElement | null = null

afterEach(() => {
  document.querySelectorAll('[data-testid="workspace-map"]').forEach((element) => element.remove())
  container?.remove()
  container = null
})

describe('WorkspaceMap', () => {
  it('focuses a terminal when its node is double-clicked', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onFocus = vi.fn()
    const onOpenChange = vi.fn()
    act(() => {
      root.render(
        <WorkspaceMap
          open
          tabs={[terminal]}
          panes={new Map()}
          onOpenChange={onOpenChange}
          onFocus={onFocus}
        />,
      )
    })

    const node = document.querySelector<HTMLButtonElement>('.workspace-map__node')
    if (node === null) throw new Error('Terminal map node was not rendered')
    act(() => {
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })

    expect(onFocus).toHaveBeenCalledWith('terminal:one')
    expect(onOpenChange).toHaveBeenCalledWith(false)

    act(() => root.unmount())
  })
})
