import type { ReactElement } from 'react'

import { Banner } from 'stuffbucket-electron/renderer'

// The placeholder notice for the dashboard. Mirrors ../workspace/Workspace.tsx's
// `top`-slot banner rule for rule: persistent, non-dismissible, and rendered
// for the whole life of a placeholder source — a dashboard is exactly the
// surface where fake totals get mistaken for real ones, so this is at least
// as loud as the workspace's version, not quieter.
//
// `Banner` is the package's own occupant of that slot, so the strip, its
// padding and its rule under the title bar are the package's now rather than
// a `.dashboard-banner` restating them. It announces itself (`role="status"`),
// and passing no `onDismiss` is what keeps it non-dismissible.
//
// The wrapper carries the `id`: `Banner` takes no `id`, and the caller wires
// `aria-describedby` from the main region so the notice is read before the
// numbers it qualifies. `aria-describedby` resolves to the element's text, so
// naming the wrapper names the banner inside it.

interface PlaceholderBannerProps {
  id: string
}

export function PlaceholderBanner({ id }: PlaceholderBannerProps): ReactElement {
  return (
    <div id={id}>
      <Banner testId="dashboard-placeholder-notice">
        <strong>Placeholder data</strong> Nothing on this dashboard is a real agent run. These
        totals, rollups, and queue entries are fixed sample values shown so the layout can be
        reviewed before live data exists.
      </Banner>
    </div>
  )
}
