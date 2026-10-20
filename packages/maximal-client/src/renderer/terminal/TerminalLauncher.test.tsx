import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  TerminalDiscovery,
  TerminalProfileSummary,
} from '@maximal/maximal-terminal'
import { TerminalLauncher } from './TerminalLauncher'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const profiles = async (): Promise<TerminalProfileSummary[]> => [
  {
    id: 'local',
    label: 'Local',
    description: 'Open a terminal on your local file system',
    kind: 'local',
  },
  { id: 'docker', label: 'Docker', kind: 'docker' },
]

const discover = async (): Promise<TerminalDiscovery> => ({
  generation: 1,
  targets: [
    {
      id: 'local',
      profileId: 'local',
      label: 'This computer',
      state: 'available',
    },
    {
      id: 'opaque-target',
      profileId: 'docker',
      label: 'desktop: web',
      state: 'available',
    },
  ],
})

let container: HTMLElement
let root: Root

async function render(
  props: Partial<Parameters<typeof TerminalLauncher>[0]> = {},
): Promise<void> {
  await act(async () => {
    root.render(
      <TerminalLauncher
        discover={discover}
        launch={async () => ({
          sessionId: 'unused',
          label: 'unused',
          canRunInBackground: false,
        })}
        onLaunched={() => undefined}
        onOpenChange={() => undefined}
        open
        profiles={profiles}
        {...props}
      />,
    )
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.replaceChildren()
})

describe('TerminalLauncher', () => {
  it('shows local profiles while discovery is still running', async () => {
    let resolveProfiles!: (value: TerminalProfileSummary[]) => void
    let resolveDiscovery!: (value: TerminalDiscovery) => void
    const pendingProfiles = new Promise<TerminalProfileSummary[]>((resolve) => {
      resolveProfiles = resolve
    })
    const pendingDiscovery = new Promise<TerminalDiscovery>((resolve) => {
      resolveDiscovery = resolve
    })

    await render({
      profiles: () => pendingProfiles,
      discover: () => pendingDiscovery,
    })
    expect(document.body.textContent).toContain('Loading terminal profiles...')

    await act(async () => resolveProfiles(await profiles()))
    expect(document.body.textContent).toContain('Local')
    expect(document.body.textContent).toContain(
      'Checking running terminals, SSH, containers, and virtual machines...',
    )

    await act(async () => resolveDiscovery(await discover()))
    expect(document.body.textContent).toContain('desktop: web')
    expect(document.body.textContent).not.toContain('Checking running terminals')
  })

  it('searches and launches its sole result from Enter', async () => {
    const launched = vi.fn()
    const launch = vi.fn(async () => ({
      sessionId: 'session-1',
      label: 'Docker',
      canRunInBackground: false,
    }))
    await render({ launch, onLaunched: launched })

    const input = document.body.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    )
    const form = input?.closest('form')
    if (!input || !form) throw new Error('Terminal search was not rendered')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, 'docker')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(launch).toHaveBeenCalledWith({
      profileId: 'docker',
      targetId: 'opaque-target',
      cols: 80,
      rows: 24,
    })
    expect(launched).toHaveBeenCalledWith({
      sessionId: 'session-1',
      label: 'Docker',
      canRunInBackground: false,
    })
  })

  it('prefers durable creation and separates running terminals', async () => {
    const launch = vi.fn(async () => ({
      sessionId: 'session-1',
      label: 'Local',
      canRunInBackground: true,
    }))
    await render({
      launch,
      profiles: async () => [
        { id: 'local', label: 'Local', kind: 'local' },
        { id: 'tmux', label: 'Local', kind: 'tmux' },
      ],
      discover: async () => ({
        generation: 1,
        targets: [
          {
            id: 'local',
            profileId: 'local',
            label: 'This computer',
            state: 'available',
          },
          {
            id: 'new',
            profileId: 'tmux',
            label: 'Local',
            state: 'available',
            purpose: 'new',
          },
          {
            id: 'running',
            profileId: 'tmux',
            label: 'Terminal 1',
            state: 'available',
            purpose: 'running',
          },
        ],
      }),
    })

    const groups = [...document.body.querySelectorAll('.maximal-menu__group')]
    const running = groups.find((group) =>
      group.querySelector('.maximal-menu__heading')?.textContent === 'Running')
    const available = groups.find((group) =>
      group.querySelector('.maximal-menu__heading')?.textContent === 'Available')
    expect(running?.textContent).toContain('Terminal 1')
    const local = [...(available?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
      .find((option) => option.textContent?.trim() === 'Local')
    if (!local) throw new Error('Durable local choice was not rendered')
    await act(async () => local.click())

    expect(launch).toHaveBeenCalledWith({
      profileId: 'tmux',
      targetId: 'new',
      cols: 80,
      rows: 24,
    })
  })

  it('surfaces launch failures without creating a terminal tab', async () => {
    const launched = vi.fn()
    await render({
      launch: async () => {
        throw new Error('no shell')
      },
      onLaunched: launched,
    })
    const choice = document.body.querySelector<HTMLElement>('[role="option"]')
    if (!choice) throw new Error('Terminal choice was not rendered')

    await act(async () => choice.click())

    expect(launched).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toBe('Terminal could not be started.')
  })
})
