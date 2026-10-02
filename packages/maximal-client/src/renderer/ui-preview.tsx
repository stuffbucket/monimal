import { StrictMode, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import './theme'
import './base'
import '@maximal/maximal-electron/renderer/styles.css'

import type { ProjectSearchResult } from '@maximal/project-catalog'
import { createYProjectMapStore } from '@maximal/maximal-project-browser'
import {
  AppFrame,
  PRODUCT_TABS,
  SETTINGS_TAB,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  Status,
  type AppTab,
} from './frame/AppFrame'
import { WorkspaceRail } from './frame/WorkspaceRail'
import { MaximalQueryProvider } from './query-client'
import { ProjectBrowser } from './projects/ProjectBrowser'
import { Settings } from './settings/Settings'
import { createPreviewSettingsCapabilities } from './settings/ui-preview-capabilities'
import type { MaximalHost } from '../shared/host'
import { UnsavedChangesProvider, useGuardedNavigation } from './unsaved-changes'

const capabilities = createPreviewSettingsCapabilities()
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
  const [tabs, setTabs] = useState<AppTab[]>([...PRODUCT_TABS, SETTINGS_TAB])
  const [activeTab, setActiveTab] = useState(SETTINGS_TAB.id)
  const [projectBrowserOpen, setProjectBrowserOpen] = useState(
    () => new URLSearchParams(window.location.search).get('surface') === 'projects',
  )
  const [openedProject, setOpenedProject] = useState<string>()
  const requestNavigation = useGuardedNavigation()
  const section = new URLSearchParams(window.location.search).get('section')
  const request =
    section === 'accounts'
      ? { id: 'settings-account-heading' as const }
      : section === 'models'
        ? { id: 'settings-models-heading' as const }
        : { id: 'settings-search-heading' as const }
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

  return (
    <AppFrame
      tabs={tabs}
      activeTab={current.id}
      surface={projectBrowserOpen ? 'projects' : current.kind}
      onSelectTab={(id) => requestNavigation(() => setActiveTab(id))}
      onCloseTab={(id) => {
        if (id === SETTINGS_TAB.id) requestNavigation(closeSettings)
      }}
      onOpenAssistant={() => undefined}
      onOpenProjects={() => setProjectBrowserOpen(true)}
    >
      {!projectBrowserOpen && current.kind === 'overview' ? <ProductPreview title="Overview" /> : null}
      {!projectBrowserOpen && current.kind === 'traffic' ? <ProductPreview title="Traffic" /> : null}
      {!projectBrowserOpen && current.kind === 'settings' ? (
        <Settings capabilities={capabilities} request={request} />
      ) : null}
      <SurfaceActivity>
        <WorkspaceRail
          current={current.id}
          onSelect={(id) => setActiveTab(id)}
          workbar={capabilities.workbar}
          account={{
            id: 'octocat',
            displayName: 'Octocat',
            handle: '@octocat',
            plan: 'individual',
          }}
          onOpenProfileSurface={() => undefined}
          onSignOut={() => undefined}
          settingsOpen={settingsOpen}
          onToggleSettings={toggleSettings}
        />
      </SurfaceActivity>
      <ProjectBrowser
        open={projectBrowserOpen}
        embedded
        onOpenChange={setProjectBrowserOpen}
        onOpenProject={(project) => {
          setOpenedProject(project.id)
          return Promise.resolve()
        }}
        onOpenSettings={() => setProjectBrowserOpen(false)}
        projectsApi={previewProjectsApi}
        mapStore={previewProjectMapStore}
      />
      <output data-testid="preview-opened-project">{openedProject}</output>
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
