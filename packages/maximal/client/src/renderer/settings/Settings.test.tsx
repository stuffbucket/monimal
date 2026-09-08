import type {
  AccountsListResponse,
  AuthStatus,
} from '@stuffbucket/maximal-core/settings-types'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SETTINGS_SECTIONS } from '../../shared/settings-sections'
import { AppFrame } from '../frame/AppFrame'
import type { SettingsCapabilities } from './capabilities'
import { Settings, type SettingsSectionRequest } from './Settings'

/*
 * What this file is for.
 *
 * The rail and the page used to be two hand-written lists in `Settings.tsx`.
 * Nothing stopped them disagreeing, and the failure is quiet: a rail entry with
 * no matching panel scrolls to nothing at all. Both are projections of the
 * manifest now, and the assertions below are what keeps that true — they check
 * the rendered output against the manifest rather than against a copy of it.
 */

// jsdom implements none of these. `ShellLayout` observes itself for resize,
// the rail marker follows an IntersectionObserver, and both jumps go through
// `scrollIntoView` and `matchMedia`. Stubs rather than fakes: no assertion
// here depends on layout maths or on an observer actually firing.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver

class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return []
  }
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []
}
globalThis.IntersectionObserver =
  NoopIntersectionObserver as unknown as typeof IntersectionObserver

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

/** Ids `scrollIntoView` was called on, in order. */
const scrolledTo: string[] = []

const authStatus: AuthStatus = { state: 'unauthenticated' }
const accountsList: AccountsListResponse = { accounts: [], active_key: null }

function fakeCapabilities(): SettingsCapabilities {
  return {
    kind: 'main-bridge',
    subscribe: vi.fn(() => () => {}),
    account: {
      status: vi.fn(async () => authStatus),
      start: vi.fn(async () => authStatus),
      cancel: vi.fn(async () => authStatus),
      signOut: vi.fn(async () => {}),
    },
    accounts: {
      list: vi.fn(async () => accountsList),
      switchTo: vi.fn(async () => {}),
    },
    connection: { proxyUrl: vi.fn(async () => 'http://127.0.0.1:4141') },
    onOpenRequest: vi.fn(() => () => {}),
    openExternal: vi.fn(async () => {}),
  }
}

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  scrolledTo.length = 0
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element): void {
    scrolledTo.push(this.id)
  }
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

async function renderSettings(request?: SettingsSectionRequest): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await rerender(request)
  return container as HTMLElement
}

/** Render into the existing root. A second call is a live prop change, which is
 *  the case where Settings is already open when the menu asks for a section. */
async function rerender(request?: SettingsSectionRequest): Promise<void> {
  // Inside the frame, because the rail is a portal into one of its slots and
  // renders nowhere at all outside it.
  await act(async () => {
    root?.render(
      <AppFrame view="settings" onSelectView={vi.fn()}>
        <Settings capabilities={fakeCapabilities()} request={request ?? null} />
      </AppFrame>,
    )
  })
}

function markedSection(surface: HTMLElement): string | undefined {
  const marked = surface.querySelectorAll('.settings-rail__link[aria-current="true"]')
  expect(marked).toHaveLength(1)
  return marked[0]?.getAttribute('data-testid') ?? undefined
}

describe('Settings', () => {
  it('lists exactly the manifest sections in the rail, in order', async () => {
    const surface = await renderSettings()
    const rail = surface.querySelectorAll('.settings-rail__link')

    expect([...rail].map((link) => link.textContent)).toEqual(
      SETTINGS_SECTIONS.map(({ label }) => label),
    )
  })

  it('renders a panel for every section the rail offers', async () => {
    // The drift regression, stated as the thing that actually breaks: every
    // rail entry names a heading id, and every one of those has to exist.
    const surface = await renderSettings()
    const targets = [...surface.querySelectorAll('.settings-rail__link')].map((link) =>
      link.getAttribute('data-testid')?.replace('settings-rail-', ''),
    )

    for (const id of targets) {
      expect(surface.querySelector(`h2#${String(id)}`)).not.toBeNull()
    }
    expect(targets).toHaveLength(SETTINGS_SECTIONS.length)
  })

  it('renders one h1, so the sections stay subordinate to the page', async () => {
    const surface = await renderSettings()

    expect(surface.querySelectorAll('.settings-page h1')).toHaveLength(1)
  })

  it('carries no "On this page" heading', async () => {
    // Documentation chrome. The nav's aria-label is what names the rail now.
    const surface = await renderSettings()

    expect(surface.textContent).not.toContain('On this page')
    expect(surface.querySelector('nav.settings-rail')?.getAttribute('aria-label')).toBe(
      'Settings sections',
    )
  })

  it('marks a section the rail was clicked on', async () => {
    const surface = await renderSettings()
    const link = surface.querySelector<HTMLButtonElement>(
      '[data-testid="settings-rail-settings-connection-heading"]',
    )

    await act(async () => {
      link?.click()
    })

    expect(link?.getAttribute('aria-current')).toBe('true')
    expect(scrolledTo).toEqual(['settings-connection-heading'])
  })

  it('scrolls to the section the application menu asked for', async () => {
    await renderSettings({ id: 'settings-accounts-heading', seq: 1 })

    expect(scrolledTo).toEqual(['settings-accounts-heading'])
  })

  it('marks a section asked for while opening this surface', async () => {
    // Not left to the observer. A request for a section already on screen
    // scrolls nowhere, so no observer fires, and the rail marked nothing —
    // which is how this surfaced when the menu was first driven by hand.
    //
    // This is the menu's usual path: choosing a section from another surface
    // mounts this one with the request already in hand.
    const surface = await renderSettings({ id: 'settings-accounts-heading', seq: 1 })

    expect(markedSection(surface)).toBe('settings-rail-settings-accounts-heading')
  })

  it('marks a section asked for while this surface is already open', async () => {
    const surface = await renderSettings({ id: 'settings-accounts-heading', seq: 1 })
    await rerender({ id: 'settings-connection-heading', seq: 2 })

    expect(markedSection(surface)).toBe('settings-rail-settings-connection-heading')
  })

  it('scrolls again when the same section is asked for twice', async () => {
    // What `seq` is for: an unchanged request object looks like nothing having
    // happened, and choosing a section a second time has to move the page.
    const surface = await renderSettings({ id: 'settings-connection-heading', seq: 1 })
    await rerender({ id: 'settings-connection-heading', seq: 2 })

    expect(scrolledTo).toEqual([
      'settings-connection-heading',
      'settings-connection-heading',
    ])
    expect(markedSection(surface)).toBe('settings-rail-settings-connection-heading')
  })
})
