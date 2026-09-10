import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PartitionedSortableList,
  type PartitionedSortableItem,
} from 'stuffbucket-electron/renderer'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const alpha = { id: 'alpha', label: 'Alpha' }
const beta = { id: 'beta', label: 'Beta' }
const gamma = { id: 'gamma', label: 'Gamma' }

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function Harness(): React.ReactElement {
  const [enabled, setEnabled] = useState<PartitionedSortableItem[]>([alpha, beta])
  const [disabled, setDisabled] = useState<PartitionedSortableItem[]>([gamma])
  return (
    <PartitionedSortableList
      enabledItems={enabled}
      disabledItems={disabled}
      onChange={(nextEnabled, nextDisabled) => {
        setEnabled(nextEnabled)
        setDisabled(nextDisabled)
      }}
    />
  )
}

async function renderList(): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => root?.render(<Harness />))
  return container
}

function rows(surface: HTMLElement): HTMLElement[] {
  return [...surface.querySelectorAll<HTMLElement>('.partitioned-sortable__item')]
}

describe('PartitionedSortableList', () => {
  it('reorders items with accessible controls', async () => {
    const surface = await renderList()
    const moveUp = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Move Beta up"]',
    )
    if (moveUp === null) throw new Error('Move up button not found')

    await act(async () => moveUp.click())

    expect(rows(surface).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Beta'),
      expect.stringContaining('Alpha'),
      expect.stringContaining('Gamma'),
    ])
  })

  it('uses a switch to disable an item and keeps disabled items at the bottom', async () => {
    const surface = await renderList()
    const disable = surface.querySelector<HTMLButtonElement>('[aria-label="Disable Alpha"]')
    if (disable === null) throw new Error('Disable switch not found')

    await act(async () => disable.click())

    expect(rows(surface).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Beta'),
      expect.stringContaining('Gamma'),
      expect.stringContaining('Alpha'),
    ])
    expect(rows(surface)[2]?.dataset.enabled).toBe('false')
    expect(surface.querySelector('[aria-label="Enable Alpha"]')?.getAttribute('aria-checked'))
      .toBe('false')
  })
})