import fs from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WorkspaceShellSpike } from '../compositions/workspace-shell-spike'
import {
  CANVAS_ZOOM,
  normalizeCanvasZoom,
  stepCanvasZoom,
} from '../utilities/canvas-zoom'
import {
  CompactProjectCluster,
  ProjectDetails,
  ProjectNavigation,
} from './project-navigation'
import {
  CanvasToolbar,
  ShellStatusControls,
  TabSearch,
} from './shell-overlays'
import { Sidebar } from './sidebar'
import { SidebarSection, SidebarSectionSplit } from './sidebar-sections'
import {
  CanvasInspectorSections,
  PageControls,
  SurfaceCanvasCluster,
} from './surface-canvas-controls'
import { TabBar } from './tab-bar'
import { Terminal } from './terminal'

function readShellStyles(): string {
  const index = new URL('../styles/index.css', import.meta.url)
  const parts = [...fs.readFileSync(index, 'utf8').matchAll(/@import '([^']+)'/gu)]
  if (parts.length === 0) throw new Error('styles/index.css imports no stylesheets')
  return parts
    .map(([, path]) => fs.readFileSync(new URL(String(path), index), 'utf8'))
    .join('\n')
}

function gridToken(path: string): unknown {
  let node: unknown = JSON.parse(
    fs.readFileSync(new URL('../../tokens/grid.json', import.meta.url), 'utf8'),
  )
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(key in node)) {
      throw new Error(`Missing grid token ${path}`)
    }
    node = Reflect.get(node, key)
  }
  if (typeof node !== 'object' || node === null || !('$value' in node)) {
    throw new Error(`Grid token ${path} has no value`)
  }
  return node.$value
}

describe('Base UI spike primitives', () => {
  it('renders an accessible tab list and selected panel', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        items={[
          { id: 'terminal', label: 'Terminal' },
          { id: 'assistant', label: 'Assistant' },
        ]}
        value="terminal"
        onValueChange={() => {}}
        renderPanel={(item) => item.label}
      />,
    )

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('role="tab"')
    expect(markup).toContain('class="maximal-tab"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('role="tabpanel"')
  })

  it('names the terminal and preserves line tones', () => {
    const markup = renderToStaticMarkup(
      <Terminal
        label="Build terminal"
        lines={[{ id: 'line', content: 'ready', tone: 'success' }]}
      />,
    )

    expect(markup).toContain('aria-label="Build terminal"')
    expect(markup).toContain('data-tone="success"')
    expect(markup).toContain('ready')
  })

  it('owns its style contract without Electron shell tokens', () => {
    const css = readShellStyles()

    expect(css).not.toContain('--shell-')
    expect(css).not.toContain('maximal-electron')
  })

  it('uses semantic macOS window radii with an unchanged generic fallback', () => {
    const css = readShellStyles()
    expect(gridToken('radius.platform.macos.outer')).toEqual({
      value: 16,
      unit: 'px',
    })
    expect(gridToken('radius.platform.macos.inner')).toEqual({
      value: 12,
      unit: 'px',
    })
    expect(gridToken('radius.window.outer')).toEqual({
      value: 13,
      unit: 'px',
    })
    expect(gridToken('radius.window.inner')).toEqual({
      value: 13,
      unit: 'px',
    })
    expect(gridToken('radius.dialog.outer')).toEqual({
      value: 13,
      unit: 'px',
    })
    expect(gridToken('radius.dialog.inner')).toEqual({
      value: 13,
      unit: 'px',
    })
    expect(css).toContain(
      ':root[data-platform="macos"] .maximal-workspace-shell',
    )
    expect(css).toContain(
      'border-radius: var(--radius-platform-macos-outer)',
    )
    expect(css).toContain('border-radius: var(--radius-window-outer)')
  })

  it('structures the navigation bar with canonical design-system glyphs', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)

    expect(markup).toContain('class="maximal-workspace-shell__navigation-bar"')
    expect(markup).toContain('class="maximal-workspace-shell__navigation-header"')
    expect(markup).toContain('class="maximal-workspace-shell__navigation-default"')
    expect(markup).toContain('class="maximal-workspace-shell__navigation-footer"')
    expect(markup).not.toContain('workbar')
    expect(markup).toContain('aria-label="Maximal"')
    expect(markup).toContain('data-icon="maximal.mark.monoline"')
    expect(markup).toContain('aria-label="Files"')
    expect(markup).toContain('data-icon="icon.16.folder"')
    expect(markup).toContain('aria-label="Agents"')
    expect(markup).toContain('data-icon="icon.16.ai"')
    expect(markup).toContain('aria-label="Editor"')
    expect(markup).toContain('data-icon="icon.16.design"')
    expect(markup).toContain('aria-label="Tools"')
    expect(markup).toContain('data-icon="icon.16.widget"')
    expect(markup).toContain('aria-label="Profile"')
    expect(markup).toContain('data-icon="icon.16.person"')
    expect(markup).toContain('aria-label="Settings"')
    expect(markup).toContain('data-icon="icon.24.settings"')
  })

  it('mounts canvas toolbars as shell-level overlays after the sidebars', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)

    expect(markup.indexOf('aria-label="Canvas sidebar"')).toBeLessThan(
      markup.indexOf('class="maximal-canvas-toolbars"'),
    )
  })

  it('renders window controls, tabs, home, and tab search in one chrome row', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)

    expect(markup).toContain('class="maximal-tabs__chrome"')
    expect(markup).toContain('aria-label="Window controls"')
    expect(markup).toContain('aria-label="Close window"')
    expect(markup).toContain('aria-label="Minimize window"')
    expect(markup).toContain('aria-label="Maximize window"')
    expect(markup).toContain('class="maximal-tabs__list"')
    expect(markup).toContain('aria-label="Workspace home"')
    expect(markup).toContain('aria-label="Add tab"')
    expect(markup).toContain('aria-label="Search tabs"')
    expect(markup).toContain('data-icon="icon.16.close"')
    expect(markup).toContain('data-icon="icon.24.minus.small"')
    expect(markup).toContain('data-icon="icon.16.rectangle"')
    expect(markup).toContain('data-icon="icon.24.command"')
    expect(markup).toContain('data-icon="icon.24.home.small"')
    expect(markup).not.toContain('maximal-workspace-shell__titlebar')
  })

  it('structures four workspace regions beneath the tab chrome', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)

    expect(markup).toContain('class="maximal-workspace-shell__navigation-bar"')
    expect(markup).toContain('aria-label="Project sidebar"')
    expect(markup).toContain('class="maximal-workspace-shell__main"')
    expect(markup).toContain('aria-label="Canvas sidebar"')
    expect(markup).toContain('class="maximal-sidebar__container"')
    expect(markup).toContain('maximal-sidebar__header--bottom-border')
    expect(markup).toContain('maximal-sidebar__header--small-bottom-padding')
    expect(markup).toContain('class="maximal-sidebar__body"')
  })

  it('composes surface controls into the right sidebar header', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)
    const rightSidebar = markup.split('aria-label="Canvas sidebar"')[1] ?? ''
    const rightHeader = rightSidebar.split('</header>')[0] ?? ''

    expect(rightHeader).toContain('data-custom-content=""')
    expect(rightHeader).toContain('aria-label="Canvas mode"')
    expect(rightHeader).toContain('aria-label="Canvas zoom, 100 percent"')
    expect(rightHeader).not.toContain('<h2>Canvas</h2>')
    expect(rightSidebar.indexOf('aria-label="Canvas mode"')).toBeLessThan(
      rightSidebar.indexOf('aria-label="Content background hex color"'),
    )
  })

  it('composes project details and a transparent toggle into the left header', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)
    const leftSidebar = markup.split('aria-label="Project sidebar"')[1] ?? ''
    const leftHeader = leftSidebar.split('</header>')[0] ?? ''

    expect(leftHeader).toContain('maximal-sidebar-project-details')
    expect(leftHeader).toContain('Ready for dev')
    expect(leftHeader).toContain('maximal-toggle-sidebar')
    expect(leftHeader).toContain('data-variant="default"')
    expect(leftHeader).not.toContain('<h2>Project</h2>')
    expect(leftSidebar.match(/maximal-sidebar-project-details/g)).toHaveLength(1)
  })

  it('uses generic edge resizers and token-sized sidebar toggles', () => {
    const markup = renderToStaticMarkup(<WorkspaceShellSpike />)
    const css = readShellStyles()

    expect(markup).toContain('role="separator"')
    expect(markup).toContain('aria-label="Resize Project sidebar"')
    expect(markup).toContain('data-edge="right"')
    expect(markup).toContain('aria-label="Resize Canvas sidebar"')
    expect(markup).toContain('data-edge="left"')
    expect(markup).toContain('aria-keyshortcuts="Shift+Meta+/"')
    expect(markup).toContain('aria-label="Hide workspace sidebars"')
    expect(markup).not.toContain('aria-label="Hide right sidebar"')
    expect(markup.match(/maximal-toggle-sidebar/g)).toHaveLength(1)
    expect(css).toContain('width: var(--spacer-2)')
    expect(css).toContain('height: var(--height-row-standard)')
    expect(css).toContain('min-height: var(--height-window-minimum)')
    expect(css).toContain('min-width: var(--width-window-minimum)')
    expect(css).toContain('var(--width-sidebar-left-minimum)')
    expect(css).toContain('var(--width-sidebar-left-maximum)')
    expect(css).toContain('var(--width-sidebar-right-minimum)')
    expect(css).toContain('var(--width-sidebar-right-maximum)')
  })

  it('uses side-specific token defaults for workspace sidebar widths', () => {
    const css = readShellStyles()
    expect(gridToken('width.sidebar.left.default')).toEqual({
      value: 346,
      unit: 'px',
    })
    expect(gridToken('width.sidebar.left.maximum')).toEqual({
      value: 366,
      unit: 'px',
    })
    expect(gridToken('width.sidebar.right.default')).toEqual({
      value: 246,
      unit: 'px',
    })
    expect(css).toContain(
      'var(--maximal-sidebar-size, var(--width-sidebar-left-default))',
    )
    expect(css).toContain(
      'var(--maximal-sidebar-size, var(--width-sidebar-right-default))',
    )
    expect(css).toContain(
      '.maximal-sidebar[data-side="right"] .maximal-sidebar__body',
    )
    expect(css).toContain('padding-inline: var(--spacer-2)')
  })

  it('uses tokenized control sizing and quiet selected icon buttons', () => {
    const css = readShellStyles()

    expect(css).toContain(':where(.maximal-workspace-shell) :where(button)')
    expect(css).toContain('height: var(--height-row-standard)')
    expect(css).toContain('padding-inline: var(--spacer-3)')
    expect(css).toContain('color: var(--maximal-color-icon-brand)')
    expect(css).toContain(
      'background: var(--maximal-color-bg-selected-quiet)',
    )
    expect(css).toContain('width: 6ch')
    expect(css).not.toContain('color-mix(')
    expect(css).not.toMatch(/z-index\s*:\s*\d+/)
    expect(css).not.toMatch(/transition:[^;]*\bease\b/)
    expect(css).toMatch(
      /\.maximal-canvas-toolbar \{[^}]*box-shadow: var\(--elevation-400\)/s,
    )
    expect(css).toMatch(
      /\.maximal-shell-notification \{[^}]*box-shadow: var\(--elevation-500\)/s,
    )
    expect(css).toMatch(
      /\.maximal-shell-status-controls \{[^}]*z-index: var\(--z-index-notification\)/s,
    )
  })

  it('owns one bounded canvas zoom policy', () => {
    expect(CANVAS_ZOOM).toEqual({
      default: 100,
      maximum: 200,
      minimum: 25,
      presets: [50, 100, 200],
      step: 10,
    })
    expect(normalizeCanvasZoom(24.6)).toBe(25)
    expect(normalizeCanvasZoom(200.4)).toBe(200)
    expect(stepCanvasZoom(195, 1)).toBe(200)
    expect(stepCanvasZoom(30, -1)).toBe(25)
  })

  it('keeps closed sidebar content mounted for state restoration', () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        id="persistent-sidebar"
        onOpenChange={() => {}}
        open={false}
        showToggle={false}
        side="right"
        title="Persistent"
      >
        <span>Retained content</span>
      </Sidebar>,
    )

    expect(markup).toContain('hidden=""')
    expect(markup).toContain('Retained content')
    expect(markup).not.toContain('maximal-toggle-sidebar')
  })

  it('structures project information, pages, and additional resources', () => {
    const detailsMarkup = renderToStaticMarkup(<ProjectDetails />)
    const navigationMarkup = renderToStaticMarkup(<ProjectNavigation />)
    const pagesMarkup =
      navigationMarkup.match(/<nav aria-label="Project pages">.*?<\/nav>/)?.[0] ?? ''

    expect(detailsMarkup).toContain('maximal-sidebar-project-details')
    expect(detailsMarkup).toContain('Ready for dev')
    expect(navigationMarkup.match(/maximal-sidebar-section(?: |")/g)).toHaveLength(2)
    expect(navigationMarkup).toContain('aria-label="Project pages"')
    expect(navigationMarkup).toContain('aria-label="Search pages"')
    expect(navigationMarkup).toContain('aria-label="Add page"')
    expect(navigationMarkup).toContain('data-icon="icon.24.plus.small"')
    expect(navigationMarkup).toContain('data-icon="icon.24.chevron.down"')
    expect(pagesMarkup).not.toContain('data-icon=')
    expect(navigationMarkup).toContain('aria-label="Resize Pages section"')
    expect(navigationMarkup).toContain('aria-orientation="horizontal"')
    expect(navigationMarkup).toContain('>Content<')
    expect(navigationMarkup).toContain('>Layers<')
    expect(navigationMarkup).toContain('>Resources<')
    expect(navigationMarkup).not.toContain('Ready for dev')
  })

  it('provides reusable sidebar section and split containers', () => {
    const markup = renderToStaticMarkup(
      <SidebarSectionSplit
        primary={
          <SidebarSection title="Pages">
            <span>Page list</span>
          </SidebarSection>
        }
        secondary={
          <SidebarSection scroll="horizontal" title="Content">
            <span>Remaining content</span>
          </SidebarSection>
        }
      />,
    )

    expect(markup.match(/maximal-sidebar-section"/g)).toHaveLength(2)
    expect(markup).toContain('maximal-sidebar-section-split__handle')
    expect(markup).toContain('maximal-horizontal-scroll-area__viewport')
    expect(markup).toContain('role="separator"')
  })

  it('renders canvas zoom and page background controls with canonical glyphs', () => {
    const markup = renderToStaticMarkup(
      <>
        <SurfaceCanvasCluster onValueChange={() => {}} value={100} />
        <PageControls
          color="#181A1D"
          onColorChange={() => {}}
          onVisibleChange={() => {}}
          visible
        />
      </>,
    )

    expect(markup).toContain('aria-label="Canvas mode"')
    expect(markup).toContain('aria-label="Canvas zoom, 100 percent"')
    expect(markup).toContain('data-icon="icon.24.chevron.down"')
    expect(markup).not.toContain('aria-label="Present canvas"')
    expect(markup).toContain('data-variant="primary"')
    expect(markup).toContain('aria-label="Choose content background color"')
    expect(markup).toContain('aria-label="Content background hex color"')
    expect(markup).toContain('aria-invalid="false"')
    expect(markup).toContain('aria-label="Hide content background"')
    expect(markup).toContain('data-icon="icon.24.eye.small"')
  })

  it('renders compact project and surface clusters without a right sidebar toggle', () => {
    const markup = renderToStaticMarkup(
      <>
        <CompactProjectCluster onOpen={() => {}} />
        <SurfaceCanvasCluster compact onValueChange={() => {}} value={100} />
      </>,
    )

    expect(markup).toContain(
      'class="maximal-control-cluster maximal-compact-project-cluster"',
    )
    expect(markup).toContain('aria-label="Project controls"')
    expect(markup).toContain('aria-label="Open sidebars"')
    expect(markup).toContain('aria-label="Surface controls"')
    expect(markup).toContain(
      'class="maximal-control-cluster maximal-compact-surface-cluster maximal-surface-cluster"',
    )
    expect(markup).not.toContain('maximal-toggle-sidebar')
  })

  it('renders referenced canvas toolbar, notification, and inspector states', () => {
    const markup = renderToStaticMarkup(
      <>
        <CanvasToolbar />
        <ShellStatusControls onZoomChange={() => {}} zoom={100} />
        <CanvasInspectorSections />
      </>,
    )

    expect(markup).toContain('aria-label="Canvas tools"')
    expect(markup).toContain('aria-label="Tool colors"')
    expect(markup).toContain('aria-label="Use green"')
    expect(markup).toContain('data-color="pink"')
    expect(markup).toContain('aria-label="Selection and navigation tools"')
    expect(markup).toContain('aria-label="Creation tools"')
    expect(markup).toContain('aria-label="Content tools"')
    expect(markup).toContain('aria-label="Select"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-label="Hand tool"')
    expect(markup).toContain('aria-label="Pen tool"')
    expect(markup).toContain('aria-label="Sticky note"')
    expect(markup).toContain('aria-label="Shapes and connectors"')
    expect(markup).toContain('data-icon="icon.24.move"')
    expect(markup).toContain('data-icon="icon.24.hand"')
    expect(markup).toContain('data-icon="icon.24.pen"')
    expect(markup).toContain('data-icon="icon.24.sticky"')
    expect(markup).toContain('data-icon="icon.24.shapes"')
    expect(markup).toContain('data-icon="icon.24.text.small"')
    expect(markup).toContain('data-icon="icon.24.section"')
    expect(markup).toContain('data-icon="icon.24.table"')
    expect(markup).toContain('data-icon="icon.16.stamp"')
    expect(markup).toContain('data-icon="icon.24.comment"')
    expect(markup).toContain('aria-label="More tools"')
    expect(markup).toContain('aria-label="Canvas zoom controls"')
    expect(markup).toContain('aria-label="Zoom out"')
    expect(markup).toContain('aria-label="Zoom in"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Turn on notifications')
    expect(markup).toContain('aria-label="Help"')
    expect(markup).toContain('id="canvas-styles-title"')
    expect(markup).toContain('id="canvas-export-title"')
    expect(markup).toContain('id="canvas-tools-title"')
  })

  it('supports a shell state without the notification prompt', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShellSpike showNotification={false} />,
    )

    expect(markup).not.toContain('maximal-shell-notification')
    expect(markup).not.toContain('Turn on notifications')
    expect(markup).toContain('aria-label="Canvas zoom controls"')
  })

  it('supports a shell state without the secondary toolbar', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShellSpike showSecondaryToolbar={false} />,
    )

    expect(markup).not.toContain('aria-label="Tool colors"')
    expect(markup).not.toContain('maximal-canvas-toolbar--secondary')
    expect(markup).toContain('aria-label="Canvas tools"')
    expect(markup).toContain('maximal-canvas-toolbar--primary')
  })

  it('renders the tab-search trigger for the provided tab state', () => {
    const markup = renderToStaticMarkup(
      <TabSearch
        activeTab="workspace"
        onActiveTabChange={() => {}}
        tabs={[{ id: 'workspace', label: 'Maximal workspace' }]}
      />,
    )

    expect(markup).toContain('aria-label="Search tabs"')
    expect(markup).toContain('aria-haspopup="dialog"')
  })

  it('exposes compact canvas mode as a distinct initial shell state', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShellSpike defaultMode="compact" />,
    )

    expect(markup).toContain('data-workspace-mode="compact"')
    expect(markup).toContain('maximal-compact-project-cluster')
    expect(markup).toContain('maximal-compact-surface-cluster')
    expect(markup).toContain('aria-label="Open sidebars"')
  })
})
