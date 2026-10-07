import { useLayoutEffect, useRef, useState } from 'react'

import {
  CompactProjectCluster,
  ProjectDetails,
  ProjectNavigation,
} from '../components/project-navigation'
import { CANVAS_ZOOM } from '../components/canvas-zoom'
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
import { type TabBarItem } from '../components/tab-bar'
import { Terminal, type TerminalLine } from '../components/terminal'
import { WindowControls } from '../components/window-controls'
import {
  AiIcon,
  CommandIcon,
  DesignIcon,
  FolderIcon,
  HomeIcon,
  MaximalMarkIcon,
  PersonIcon,
  PlusIcon,
  SettingsIcon,
  WidgetIcon,
} from '../icons'
import { Button, IconButton } from '../primitives/button'
import { WorkspaceShell } from './workspace-shell'

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
  { id: '4', content: 'maximal-desktop:dev: renderer dev server ready', tone: 'success' },
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

export interface WorkspaceShellSpikeProps {
  defaultMode?: 'expanded' | 'compact'
  showNotification?: boolean
  showSecondaryToolbar?: boolean
  /** Fills the host window instead of drawing a floating frame. */
  fill?: boolean
  /** Reserves space for platform-drawn window controls instead of drawing them. */
  nativeWindowControls?: boolean
}

export function WorkspaceShellSpike({
  defaultMode = 'expanded',
  showNotification = true,
  showSecondaryToolbar = true,
  fill = false,
  nativeWindowControls = false,
}: WorkspaceShellSpikeProps) {
  const [activeTab, setActiveTab] = useState('workspace')
  const [sidebarsOpen, setSidebarsOpen] = useState(defaultMode === 'expanded')
  const [leftPagesHeight, setLeftPagesHeight] = useState<number>()
  const [contentZoom, setContentZoom] = useState<number>(CANVAS_ZOOM.default)
  const [contentBackgroundColor, setContentBackgroundColor] = useState('#FFFFFF')
  const [contentBackgroundVisible, setContentBackgroundVisible] = useState(true)
  const contentViewportRef = useRef<HTMLElement>(null)

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

  return (
    <WorkspaceShell
      activeTab={activeTab}
      backgroundVisible={contentBackgroundVisible}
      fill={fill}
      compactContent={
        <>
          <CompactProjectCluster onOpen={() => setSidebarsOpen(true)} />
          <SurfaceCanvasCluster
            compact
            onValueChange={setContentZoom}
            value={contentZoom}
          />
        </>
      }
      leftSidebar={{
        label: 'Project',
        header: <ProjectDetails />,
        bodyScrollable: false,
        toggleLabel: 'Hide workspace sidebars',
        content: (
          <ProjectNavigation
            onPagesHeightChange={setLeftPagesHeight}
            pagesHeight={leftPagesHeight}
          />
        ),
      }}
      mainOverlay={
        <ShellStatusControls
          onZoomChange={setContentZoom}
          showNotification={showNotification}
          zoom={contentZoom}
        />
      }
      mainRef={contentViewportRef}
      navigation={{
        header: (
          <IconButton label="Maximal">
            <MaximalMarkIcon />
          </IconButton>
        ),
        items: (
          <>
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
          </>
        ),
        footer: (
          <>
            <IconButton label="Profile">
              <PersonIcon />
            </IconButton>
            <IconButton label="Settings">
              <SettingsIcon />
            </IconButton>
          </>
        ),
      }}
      onActiveTabChange={setActiveTab}
      onSidebarsOpenChange={setSidebarsOpen}
      renderPanel={(item) => (
        <div className="maximal-canvas-viewport">
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
      )}
      rightSidebar={{
        label: 'Canvas',
        header: (
          <SurfaceCanvasCluster
            onValueChange={setContentZoom}
            value={contentZoom}
          />
        ),
        content: (
          <>
            <PageControls
              color={contentBackgroundColor}
              onColorChange={setContentBackgroundColor}
              onVisibleChange={setContentBackgroundVisible}
              visible={contentBackgroundVisible}
            />
            <CanvasInspectorSections />
          </>
        ),
      }}
      sidebarsOpen={sidebarsOpen}
      tabLeading={
        <>
          <WindowControls native={nativeWindowControls} />
          <IconButton label="Workspace home">
            <HomeIcon />
          </IconButton>
        </>
      }
      tabTrailing={
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
      tabs={WORKSPACE_TABS}
    >
      <CanvasToolbar showSecondary={showSecondaryToolbar} />
    </WorkspaceShell>
  )
}
