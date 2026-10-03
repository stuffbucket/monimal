import { StrictMode, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import './theme'
import './base'
import '@maximal/maximal-electron/renderer/styles.css'

import type { ProjectSearchResult } from '@maximal/project-catalog'
import { createYProjectMapStore } from '@maximal/maximal-project-browser'
import { Button, Dialog } from '@maximal/maximal-electron/renderer'
import type { DetachableTerminalTransport } from '@maximal/maximal-terminal/renderer'
import {
  AppFrame,
  PRODUCT_TABS,
  PROJECTS_TAB,
  SETTINGS_TAB,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  Status,
  type AppTab,
} from './frame/AppFrame'
import { WorkspaceRail } from './frame/WorkspaceRail'
import { WORKBAR_PROFILE_SECTIONS } from './frame/workbar-layout'
import { WorkspaceHome } from './home/WorkspaceHome'
import { BrowserSessions, TerminalSessions } from './home/WorkspaceSessions'
import { MaximalQueryProvider } from './query-client'
import { ProjectBrowser } from './projects/ProjectBrowser'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import { createPreviewSettingsCapabilities } from './settings/ui-preview-capabilities'
import type { MaximalHost } from '../shared/host'
import { UnsavedChangesProvider, useGuardedNavigation } from './unsaved-changes'

const capabilities = createPreviewSettingsCapabilities()
const previewSessionError = 'Session actions are available in the desktop workspace, not the UI preview.'
const unavailableSession = () => Promise.reject(new Error(previewSessionError))
const previewTerminalTransport: DetachableTerminalTransport = {
  list: unavailableSession,
  spawn: unavailableSession,
  write: unavailableSession,
  resize: unavailableSession,
  terminate: unavailableSession,
  subscribe: () => () => undefined,
}
const previewProjectMapStore = createYProjectMapStore()
previewProjectMapStore.updatePresence('preview-agent', {
  id: 'agent',
  name: 'Planning agent',
  initials: 'AI',
  color: '#a259ff',
  kind: 'agent',
  pageId: 'projects',
  cursor: { x: 760, y: 340 },
  selectedIds: [],
})
previewProjectMapStore.updatePresence('preview-harness', {
  id: 'harness',
  name: 'Demo harness',
  initials: 'DH',
  color: '#14ae5c',
  kind: 'harness',
  pageId: 'projects',
  cursor: { x: 1040, y: 500 },
  selectedIds: [],
})
const previewProjects: ProjectSearchResult[] = [
  {
    id: 'maximal-client',
    name: 'maximal-client',
    path: '/workspace/packages/maximal-client',
    kind: 'repository',
    availability: 'available',
    remotes: [],
    markers: ['package.json'],
    lastSeenAt: '2026-09-30T00:00:00.000Z',
    visitCount: 8,
    pinned: true,
    trusted: true,
    score: 1,
  },
  {
    id: 'maximal-electron',
    name: 'maximal-electron',
    path: '/workspace/packages/maximal-electron',
    kind: 'repository',
    availability: 'available',
    remotes: [],
    markers: ['package.json'],
    lastSeenAt: '2026-09-30T00:00:00.000Z',
    visitCount: 5,
    pinned: false,
    trusted: true,
    score: 0.9,
  },
  {
    id: 'project-catalog',
    name: 'project-catalog',
    path: '/workspace/packages/project-catalog',
    kind: 'repository',
    availability: 'available',
    remotes: [],
    markers: ['package.json'],
    lastSeenAt: '2026-09-30T00:00:00.000Z',
    visitCount: 3,
    pinned: false,
    trusted: true,
    score: 0.8,
  },
]

const previewProjectsApi: MaximalHost['projects'] = {
  undockWindow() { return Promise.reject(new Error('Window transfer requires the desktop client.')) },
  redockWindow() { return Promise.reject(new Error('Window transfer requires the desktop client.')) },
  windowState() { return Promise.resolve(undefined) },
  onWindowRedocked() { return () => undefined },
  openWorkspaceSettings() { return Promise.reject(new Error('Window transfer requires the desktop client.')) },
  search(query) {
    const normalized = query.trim().toLowerCase()
    return Promise.resolve(previewProjects.filter((project) =>
      `${project.name} ${project.path}`.toLowerCase().includes(normalized)))
  },
  snapshot() {
    return Promise.resolve({ roots: [], projects: previewProjects, refreshing: false })
  },
  addRoot() {
    return Promise.resolve(null)
  },
  updateRoot() {
    return Promise.reject(new Error('The UI preview does not mutate discovery roots.'))
  },
  async removeRoot() {},
  refresh() {
    return Promise.resolve({ roots: [], projects: previewProjects, refreshing: false })
  },
  async opened() {},
  onChange() {
    return () => undefined
  },
}

function ProductPreview({ title }: { title: string }): ReactElement {
  return (
    <>
      <SurfaceRail>
        {(collapsed) => collapsed ? null : <nav aria-label={`${title} sections`}>{title}</nav>}
      </SurfaceRail>
      <SurfaceRight>
        <aside aria-label={`${title} details`}>{title} details</aside>
      </SurfaceRight>
      <Status id={`${title.toLowerCase()}-preview`}>{title} preview</Status>
      <main>
        <h1>{title}</h1>
      </main>
    </>
  )
}

function PreviewFrame(): ReactElement {
  const initialProjectsOpen =
    new URLSearchParams(window.location.search).get('surface') === 'projects'
  const [tabs, setTabs] = useState<AppTab[]>([
    ...PRODUCT_TABS,
    SETTINGS_TAB,
    ...(initialProjectsOpen ? [PROJECTS_TAB] : []),
  ])
  const [activeTab, setActiveTab] = useState(
    initialProjectsOpen ? PROJECTS_TAB.id : SETTINGS_TAB.id,
  )
  const [openedProject, setOpenedProject] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const requestNavigation = useGuardedNavigation()
  const section = new URLSearchParams(window.location.search).get('section')
  const [request, setRequest] = useState<SettingsSectionRequest>(
    section === 'accounts'
      ? { id: 'settings-account-heading' as const }
      : section === 'models'
        ? { id: 'settings-models-heading' as const }
        : section === 'appearance'
          ? { id: 'settings-typography-heading' as const }
          : { id: 'settings-search-heading' as const },
  )
  const current = tabs.find((tab) => tab.id === activeTab) ?? PRODUCT_TABS[0]
  const settingsOpen = tabs.some((tab) => tab.kind === 'settings')

  const closeSettings = (): void => {
    setTabs((currentTabs) => currentTabs.filter((tab) => tab.kind !== 'settings'))
    if (activeTab === SETTINGS_TAB.id) setActiveTab(PRODUCT_TABS[0].id)
  }

  const toggleSettings = (): void => {
    requestNavigation(() => {
      if (settingsOpen) {
        closeSettings()
        return
      }
      setTabs((currentTabs) => [...currentTabs, SETTINGS_TAB])
      setActiveTab(SETTINGS_TAB.id)
    })
  }

  const openSettingsTab = (): void => {
    if (!settingsOpen) setTabs((currentTabs) => [...currentTabs, SETTINGS_TAB])
    setActiveTab(SETTINGS_TAB.id)
  }

  const openProjects = (): void => {
    setTabs((currentTabs) => currentTabs.some((tab) => tab.id === PROJECTS_TAB.id)
      ? currentTabs
      : [...currentTabs, PROJECTS_TAB])
    setActiveTab(PROJECTS_TAB.id)
  }

  const closeProjects = (): void => {
    setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== PROJECTS_TAB.id))
    if (activeTab === PROJECTS_TAB.id) setActiveTab(PRODUCT_TABS[0].id)
  }
  const selectTab = (id: string): void => requestNavigation(() => {
    if (id === PROJECTS_TAB.id) openProjects()
    else setActiveTab(id)
  })
  const sessionAction = (): void => setActionError(previewSessionError)

  return (
    <AppFrame
      tabs={tabs}
      activeTab={current.id}
      surface={current.kind}
      onSelectTab={selectTab}
      onCloseTab={(id) => {
        if (id === SETTINGS_TAB.id) requestNavigation(closeSettings)
        if (id === PROJECTS_TAB.id) closeProjects()
      }}
      onOpenProjects={() => selectTab(PROJECTS_TAB.id)}
      assistant={{
        recent: [],
        hotkey: 'CommandOrControl+Shift+Space',
        onToggle: () => undefined,
        onOpenChat: () => undefined,
        onShowMore: () => undefined,
      }}
    >
      {current.kind === 'overview' ? <ProductPreview title="Overview" /> : null}
      {current.kind === 'traffic' ? <ProductPreview title="Traffic" /> : null}
      {current.kind === 'home' ? (
        <WorkspaceHome tabs={tabs} onSelectTab={selectTab} onOpenProjects={() => selectTab(PROJECTS_TAB.id)} onNewTerminal={sessionAction} onNewBrowser={sessionAction} />
      ) : null}
      {current.kind === 'terminals' ? (
        <TerminalSessions tabs={tabs} transport={previewTerminalTransport} onSelectTab={selectTab} onResume={sessionAction} onNew={sessionAction} onClose={sessionAction} />
      ) : null}
      {current.kind === 'browsers' ? (
        <BrowserSessions tabs={tabs} onSelectTab={selectTab} onNew={sessionAction} onClose={sessionAction} />
      ) : null}
      {current.kind === 'settings' ? (
        <Settings capabilities={capabilities} request={request} />
      ) : null}
      <SurfaceActivity>
        <WorkspaceRail
          current={current.kind}
          onSelect={selectTab}
          workbar={capabilities.workbar}
          account={{
            id: 'octocat',
            displayName: 'Octocat',
            handle: '@octocat',
            plan: 'individual',
          }}
          onOpenProfileSurface={(surface) => requestNavigation(() => {
            setRequest({ id: WORKBAR_PROFILE_SECTIONS[surface] })
            openSettingsTab()
          })}
          settingsOpen={settingsOpen}
          onToggleSettings={toggleSettings}
        />
      </SurfaceActivity>
      <ProjectBrowser
        open={current.kind === 'projects'}
        embedded
        onOpenChange={(open) => {
          if (!open) closeProjects()
        }}
        onOpenProject={(project) => {
          setOpenedProject(project.id)
          return Promise.resolve()
        }}
        onOpenSettings={openSettingsTab}
        projectsApi={previewProjectsApi}
        mapStore={previewProjectMapStore}
      />
      <output data-testid="preview-opened-project">{openedProject}</output>
      <Dialog
        open={actionError !== undefined}
        onOpenChange={(open) => { if (!open) setActionError(undefined) }}
        title="Desktop workspace required"
        description={actionError}
      >
        <Button onClick={() => setActionError(undefined)}>Done</Button>
      </Dialog>
    </AppFrame>
  )
}

function SettingsPreview(): ReactElement {
  return (
    <MaximalQueryProvider>
      <UnsavedChangesProvider>
        <PreviewFrame />
      </UnsavedChangesProvider>
    </MaximalQueryProvider>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <SettingsPreview />
    </StrictMode>,
  )
}
