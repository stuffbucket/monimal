import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  CompactProjectCluster,
  ProjectDetails,
  ProjectNavigation,
} from '../components/project-navigation'
import { CANVAS_ZOOM } from '../components/canvas-zoom'
import { Sidebar } from '../components/sidebar'
import {
  CanvasToolbar,
  ShellStatusControls,
  TabSearch,
} from '../components/shell-overlays'
import {
  CanvasInspectorSections,
  PageControls,
  SurfaceCanvasCluster,
} from '../components/surface-canvas-controls'
import { TabBar, type TabBarItem } from '../components/tab-bar'
import { Terminal, type TerminalLine } from '../components/terminal'
import {
  AiIcon,
  CloseIcon,
  CommandIcon,
  DesignIcon,
  FolderIcon,
  HomeIcon,
  MaximalMarkIcon,
  MaximizeIcon,
  MinimizeIcon,
  PersonIcon,
  PlusIcon,
  SettingsIcon,
  WidgetIcon,
} from '../icons'
import { Button, IconButton } from '../primitives/button'

const WORKSPACE_TABS: readonly TabBarItem[] = [
  { id: 'workspace', label: 'Maximal workspace', icon: <DesignIcon /> },
  { id: 'components', label: 'Components', icon: <WidgetIcon /> },
  { id: 'tokens', label: 'Design tokens', icon: <DesignIcon /> },
  { id: 'terminal', label: 'Terminal', icon: <CommandIcon /> },
  { id: 'assistant', label: 'Assistant', icon: <AiIcon /> },
  { id: 'architecture', label: 'Architecture', icon: <DesignIcon /> },
  { id: 'untitled', label: 'Untitled', icon: <WidgetIcon /> },
]

const TERMINAL_LINES: readonly TerminalLine[] = [
  { id: '1', content: 'monimal main $ pnpm dev', tone: 'command' },
  { id: '2', content: '• Packages in scope: maximal-desktop', tone: 'muted' },
  { id: '3', content: '• Running dev in 1 package', tone: 'output' },
  { id: '4', content: 'maximal-desktop:dev: ready on http://localhost:5173', tone: 'success' },
  { id: '5', content: 'maximal-desktop:dev: electron renderer connected', tone: 'success' },
  { id: '6', content: 'monimal main $', tone: 'command' },
]

function AssistantPanel() {
  return (
    <div className="maximal-assistant-spike">
      <span className="maximal-assistant-spike__eyebrow">Workspace assistant</span>
      <h2>Design system spike</h2>
      <p>
        Base UI owns interaction behavior. Maximal tokens and CSS own every visible
        decision.
      </p>
      <Button variant="primary">Start a task</Button>
    </div>
  )
}

function WindowControls() {
  return (
    <div className="maximal-window-controls" role="group" aria-label="Window controls">
      <IconButton label="Close window">
        <CloseIcon />
      </IconButton>
      <IconButton label="Minimize window">
        <MinimizeIcon />
      </IconButton>
      <IconButton label="Maximize window">
        <MaximizeIcon />
      </IconButton>
    </div>
  )
}

export interface WorkspaceShellSpikeProps {
  defaultMode?: 'expanded' | 'compact'
  showNotification?: boolean
  showSecondaryToolbar?: boolean
}

export function WorkspaceShellSpike({
  defaultMode = 'expanded',
  showNotification = true,
  showSecondaryToolbar = true,
}: WorkspaceShellSpikeProps) {
  const [activeTab, setActiveTab] = useState('workspace')
  const [sidebarsOpen, setSidebarsOpen] = useState(defaultMode === 'expanded')
  const [leftSidebarSize, setLeftSidebarSize] = useState<number>()
  const [rightSidebarSize, setRightSidebarSize] = useState<number>()
  const [leftSidebarScrollTop, setLeftSidebarScrollTop] = useState(0)
  const [rightSidebarScrollTop, setRightSidebarScrollTop] = useState(0)
  const [leftPagesHeight, setLeftPagesHeight] = useState<number>()
  const [contentZoom, setContentZoom] = useState<number>(CANVAS_ZOOM.default)
  const [contentBackgroundColor, setContentBackgroundColor] = useState('#FFFFFF')
  const [contentBackgroundVisible, setContentBackgroundVisible] = useState(true)
  const contentViewportRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    contentViewportRef.current?.style.setProperty(
      '--maximal-content-zoom',
      String(contentZoom / 100),
    )
    contentViewportRef.current?.style.setProperty(
      '--maximal-content-background',
      contentBackgroundColor,
    )
  }, [contentBackgroundColor, contentZoom])

  useEffect(() => {
    const handleToggleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey || !event.shiftKey || event.code !== 'Slash') return

      event.preventDefault()
      setSidebarsOpen((open) => !open)
    }

    window.addEventListener('keydown', handleToggleShortcut)
    return () => window.removeEventListener('keydown', handleToggleShortcut)
  }, [])

  return (
    <div
      className="maximal-workspace-shell"
      data-workspace-mode={sidebarsOpen ? 'expanded' : 'compact'}
    >
      <nav className="maximal-workspace-shell__navigation-bar" aria-label="Workspace navigation">
        <div className="maximal-workspace-shell__navigation-header">
          <IconButton label="Maximal">
            <MaximalMarkIcon />
          </IconButton>
        </div>
        <div className="maximal-workspace-shell__navigation-default">
          <IconButton aria-current="page" label="Files" selected>
            <FolderIcon />
          </IconButton>
          <IconButton label="Agents">
            <AiIcon />
          </IconButton>
          <IconButton label="Editor">
            <DesignIcon />
          </IconButton>
          <IconButton label="Tools">
            <WidgetIcon />
          </IconButton>
        </div>
        <div className="maximal-workspace-shell__navigation-footer">
          <IconButton label="Profile">
            <PersonIcon />
          </IconButton>
          <IconButton label="Settings">
            <SettingsIcon />
          </IconButton>
        </div>
      </nav>

      <Sidebar
        bodyScrollable={false}
        headerContent={<ProjectDetails />}
        id="workspace-left-sidebar"
        onOpenChange={setSidebarsOpen}
        onScrollTopChange={setLeftSidebarScrollTop}
        onSizeChange={setLeftSidebarSize}
        open={sidebarsOpen}
        resizable
        scrollTop={leftSidebarScrollTop}
        side="left"
        size={leftSidebarSize}
        label="Project"
        toggleLabel="Hide workspace sidebars"
      >
        <ProjectNavigation
          onPagesHeightChange={setLeftPagesHeight}
          pagesHeight={leftPagesHeight}
        />
      </Sidebar>

      <main
        className="maximal-workspace-shell__main"
        data-background-visible={contentBackgroundVisible ? '' : undefined}
        ref={contentViewportRef}
      >
        {!sidebarsOpen ? (
          <>
            <CompactProjectCluster onOpen={() => setSidebarsOpen(true)} />
            <SurfaceCanvasCluster
              compact
              onValueChange={setContentZoom}
              value={contentZoom}
            />
          </>
        ) : null}
        <TabBar
          items={WORKSPACE_TABS}
          value={activeTab}
          onValueChange={setActiveTab}
          leading={
            <>
              <WindowControls />
              <IconButton label="Workspace home">
                <HomeIcon />
              </IconButton>
            </>
          }
          trailing={
            <>
              <IconButton label="Add tab">
                <PlusIcon />
              </IconButton>
              <TabSearch
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
                tabs={WORKSPACE_TABS}
              />
            </>
          }
          renderPanel={(item) =>
            (
              <div
                className="maximal-canvas-viewport"
              >
                <div className="maximal-canvas-content">
                  {item.id === 'terminal' ? (
                    <Terminal label="Development terminal" lines={TERMINAL_LINES} />
                  ) : item.id === 'assistant' ? (
                    <AssistantPanel />
                  ) : (
                    <div
                      aria-label={`${item.label} canvas`}
                      className="maximal-canvas-board"
                      role="region"
                    />
                  )}
                </div>
              </div>
            )
          }
        />
        <ShellStatusControls
          onZoomChange={setContentZoom}
          showNotification={showNotification}
          zoom={contentZoom}
        />
      </main>

      <Sidebar
        headerContent={
          <SurfaceCanvasCluster
            onValueChange={setContentZoom}
            value={contentZoom}
          />
        }
        id="workspace-right-sidebar"
        label="Canvas"
        onOpenChange={setSidebarsOpen}
        onScrollTopChange={setRightSidebarScrollTop}
        onSizeChange={setRightSidebarSize}
        open={sidebarsOpen}
        resizable
        scrollTop={rightSidebarScrollTop}
        showToggle={false}
        side="right"
        size={rightSidebarSize}
      >
        <PageControls
          color={contentBackgroundColor}
          onColorChange={setContentBackgroundColor}
          onVisibleChange={setContentBackgroundVisible}
          visible={contentBackgroundVisible}
        />
        <CanvasInspectorSections />
      </Sidebar>
      <CanvasToolbar showSecondary={showSecondaryToolbar} />
    </div>
  )
}
