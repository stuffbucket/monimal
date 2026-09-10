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

function Fixture({
  save,
  canSave = true,
}: {
  save: () => Promise<boolean>
  canSave?: boolean
}) {
  const [dirty, setDirty] = useState(true)
  const [destination, setDestination] = useState('search')
  const navigate = useGuardedNavigation()
  const controller = useMemo(
    () => ({
      hasChanges: () => dirty,
      canSave: () => canSave,
      save,
      discard: () => setDirty(false),
    }),
    [canSave, dirty, save],
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

async function renderFixture(
  save = vi.fn(async () => true),
  canSave = true,
): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <UnsavedChangesProvider>
        <Fixture save={save} canSave={canSave} />
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

  it('closes without navigating when save reports a handled failure', async () => {
    const surface = await renderFixture(vi.fn(async () => false))

    await act(async () => button('Models').click())
    await act(async () => button('Save changes').click())

    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('search')
    expect(document.querySelector('[data-testid="unsaved-changes-dialog"]')).toBeNull()
  })

  it('disables save when the active controller cannot save', async () => {
    await renderFixture(vi.fn(async () => true), false)

    await act(async () => button('Models').click())

    expect(button('Save changes').disabled).toBe(true)
    expect(button('Cancel').disabled).toBe(false)
    expect(button('Discard changes').disabled).toBe(false)
  })

  it('locks every decision while saving and proceeds only after completion', async () => {
    let finishSave: ((saved: boolean) => void) | undefined
    const save = vi.fn(
      () => new Promise<boolean>((resolve) => {
        finishSave = resolve
      }),
    )
    const surface = await renderFixture(save)

    await act(async () => button('Models').click())
    await act(async () => button('Save changes').click())

    expect(button('Saving…').disabled).toBe(true)
    expect(button('Cancel').disabled).toBe(true)
    expect(button('Discard changes').disabled).toBe(true)
    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('search')

    await act(async () => finishSave?.(true))

    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('models')
  })

  it('stays put and restores the decisions when saving rejects', async () => {
    const save = vi.fn(async () => {
      throw new Error('storage unavailable')
    })
    const surface = await renderFixture(save)

    await act(async () => button('Models').click())
    await act(async () => button('Save changes').click())

    expect(surface.querySelector('[data-testid="destination"]')?.textContent).toBe('search')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Changes could not be saved. Try again or discard them.',
    )
    expect(button('Save changes').disabled).toBe(false)
    expect(button('Cancel').disabled).toBe(false)
    expect(button('Discard changes').disabled).toBe(false)
  })
})