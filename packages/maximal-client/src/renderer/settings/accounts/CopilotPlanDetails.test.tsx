import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CopilotAccountUsage } from '../capabilities'
import { CopilotPlanDetails } from './CopilotPlanDetails'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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
  vi.restoreAllMocks()
})

async function renderDetails(
  usage: CopilotAccountUsage | null,
  overrides: {
    loading?: boolean
    error?: string | null
    onRefresh?: () => void
    onOpenInsights?: () => void
  } = {},
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <CopilotPlanDetails
        usage={usage}
        loading={overrides.loading ?? false}
        error={overrides.error ?? null}
        onRefresh={overrides.onRefresh ?? vi.fn()}
        onOpenInsights={overrides.onOpenInsights ?? vi.fn()}
      />,
    )
    await Promise.resolve()
  })
  return container
}

describe('CopilotPlanDetails', () => {
  it('renders plan, quota, reset date, and entitlement details', async () => {
    const surface = await renderDetails({
      copilot_plan: 'enterprise',
      quota_reset_date: '2026-04-01',
      quota_snapshots: {
        completions: { unlimited: true },
        premium_interactions: {
          percent_remaining: 65,
          remaining: 650,
          entitlement: 1000,
        },
      },
    })

    expect(surface.textContent).toContain('Enterprise')
    expect(surface.textContent).toContain('35% used')
    expect(surface.textContent).toContain('Apr 1, 2026')
    expect(surface.textContent).toContain('Inline Suggestions')
    expect(surface.textContent).toContain('Enabled')
    expect(surface.textContent).toContain('Codebase Semantic Index')
    expect(surface.textContent).toContain('Session Sync')
    expect(surface.textContent).toContain('Not available')
  })

  it('supports lean usage responses and both actions', async () => {
    const onRefresh = vi.fn()
    const onOpenInsights = vi.fn()
    const surface = await renderDetails(
      { copilot_plan: 'individual' },
      { onRefresh, onOpenInsights },
    )

    expect(surface.textContent).toContain('Individual')
    expect(surface.textContent).toContain('Not reported')

    await act(async () => {
      ;[...surface.querySelectorAll('button')]
        .find((button) => button.textContent === 'Refresh')
        ?.click()
      ;[...surface.querySelectorAll('button')]
        .find((button) => button.textContent === 'Show insights')
        ?.click()
    })

    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onOpenInsights).toHaveBeenCalledOnce()
  })

  it('renders loading and error states explicitly', async () => {
    let surface = await renderDetails(null, { loading: true })
    expect(surface.textContent).toContain('Loading usage')
    expect(surface.querySelector('progress')).not.toBeNull()
    expect(surface.querySelector('progress')?.style.visibility).toBe('hidden')

    surface = await renderDetails(null, { error: 'Usage request failed' })
    expect(surface.textContent).toContain('Usage request failed')
  })
})
