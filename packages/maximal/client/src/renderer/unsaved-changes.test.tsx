import { act, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UnsavedChangesProvider,
  useGuardedNavigation,
  useUnsavedChangesController,
} from './unsaved-changes'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

function Fixture({ save }: { save: () => Promise<boolean> }) {
  const [dirty, setDirty] = useState(true)
  const [destination, setDestination] = useState('search')
  const navigate = useGuardedNavigation()
  const controller = useMemo(
    () => ({
      hasChanges: () => dirty,
      canSave: () => true,
      save,
      discard: () => setDirty(false),
    }),
    [dirty, save],
  )
  useUnsavedChangesController(controller)

  return (
    <>
      <span data-testid="destination">{destination}</span>
      <button onClick={() => navigate(() => setDestination('models'))}>Models</button>
    </>
  )
}

function button(label: string): HTMLButtonElement {
  const candidate = [...document.querySelectorAll('button')].find(
    (element) => element.textContent === label,
  )
  if (candidate === undefined) throw new Error(`${label} button was not rendered`)
  return candidate
}

async function renderFixture(save = vi.fn(async () => true)): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <UnsavedChangesProvider>
        <Fixture save={save} />
      </UnsavedChangesProvider>,
    )
  })
  return container
}

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  document.querySelectorAll('.sb-shell--standalone').forEach((node) => node.remove())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('UnsavedChangesProvider', () => {
  it('keeps the page on cancel and proceeds after discard', async () => {
    const surface = await renderFixture()
    await act(async () => button('Models').click())
    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('search')

    await act(async () => button('Cancel').click())
    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('search')

    await act(async () => button('Models').click())
    await act(async () => button('Discard changes').click())
    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('models')
  })

  it('waits for a successful save before navigating', async () => {
    const save = vi.fn(async () => true)
    const surface = await renderFixture(save)

    await act(async () => button('Models').click())
    await act(async () => button('Save changes').click())

    expect(save).toHaveBeenCalledOnce()
    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('models')
  })
})