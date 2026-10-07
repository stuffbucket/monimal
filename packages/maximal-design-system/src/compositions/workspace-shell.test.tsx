import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WindowControls } from '../components/window-controls'
import { WorkspaceShell, type WorkspaceShellProps } from './workspace-shell'

const TABS = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
]

function shell(props: Partial<WorkspaceShellProps> = {}): string {
  return renderToStaticMarkup(
    <WorkspaceShell
      activeTab="one"
      onActiveTabChange={() => undefined}
      onSidebarsOpenChange={() => undefined}
      renderPanel={(item) => <p>{`${item.label} panel`}</p>}
      sidebarsOpen
      tabs={TABS}
      {...props}
    />,
  )
}

describe('WorkspaceShell', () => {
  it('draws a floating frame unless asked to fill its host', () => {
    expect(shell()).not.toContain('data-fill')
    expect(shell({ fill: true })).toContain('data-fill=""')
  })

  it('omits navigation and sidebars that the consumer does not supply', () => {
    const markup = shell()

    expect(markup).not.toContain('maximal-workspace-shell__navigation-bar')
    expect(markup).not.toContain('maximal-sidebar')
    expect(markup).toContain('One panel')
  })

  it('renders supplied sidebars with their consumer labels', () => {
    const markup = shell({
      leftSidebar: { label: 'Sessions', content: <p>left</p> },
      rightSidebar: { label: 'Details', content: <p>right</p> },
    })

    expect(markup).toContain('aria-label="Sessions sidebar"')
    expect(markup).toContain('aria-label="Details sidebar"')
  })

  it('draws the close glyph only on an active, closable tab', () => {
    const closeGlyph = 'maximal-tab__close-icon'

    expect(shell()).toContain(closeGlyph)
    expect(shell({ tabs: [{ id: 'one', label: 'One', closable: false }] })).not.toContain(closeGlyph)
  })

  it('shows compact content only while the sidebars are collapsed', () => {
    const compact = <p>compact cluster</p>

    expect(shell({ compactContent: compact })).not.toContain('compact cluster')
    expect(shell({ compactContent: compact, sidebarsOpen: false })).toContain(
      'compact cluster',
    )
  })
})

describe('WindowControls', () => {
  it('reserves an inert footprint for platform-drawn controls', () => {
    const markup = renderToStaticMarkup(<WindowControls native />)

    expect(markup).toContain('data-native=""')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('<button')
  })

  it('draws three labelled buttons otherwise', () => {
    const markup = renderToStaticMarkup(<WindowControls />)

    expect(markup.match(/<button/g)).toHaveLength(3)
    expect(markup).toContain('aria-label="Close window"')
  })
})
