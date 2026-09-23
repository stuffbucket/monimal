import { StrictMode, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import './theme'
import './base'
import 'stuffbucket-electron/renderer/styles.css'

import {
  AppFrame,
  PRODUCT_TABS,
  SETTINGS_TAB,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
  type AppTab,
} from './frame/AppFrame'
import { WorkspaceRail } from './frame/WorkspaceRail'
import { Settings } from './settings/Settings'
import { createPreviewSettingsCapabilities } from './settings/ui-preview-capabilities'
import { UnsavedChangesProvider, useGuardedNavigation } from './unsaved-changes'

const capabilities = createPreviewSettingsCapabilities()

function ProductPreview({ title }: { title: string }): ReactElement {
  return (
    <>
      <SurfaceRail>
        {(collapsed) => collapsed ? null : <nav aria-label={`${title} sections`}>{title}</nav>}
      </SurfaceRail>
      <SurfaceRight>
        <aside aria-label={`${title} details`}>{title} details</aside>
      </SurfaceRight>
      <SurfaceStatus>{title} preview</SurfaceStatus>
      <main>
        <h1>{title}</h1>
      </main>
    </>
  )
}

function PreviewFrame(): ReactElement {
  const [tabs, setTabs] = useState<AppTab[]>([...PRODUCT_TABS, SETTINGS_TAB])
  const [activeTab, setActiveTab] = useState(SETTINGS_TAB.id)
  const requestNavigation = useGuardedNavigation()
  const section = new URLSearchParams(window.location.search).get('section')
  const request = section === 'accounts'
    ? { id: 'settings-account-heading' as const }
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
      surface={current.kind}
      onSelectTab={(id) => requestNavigation(() => setActiveTab(id))}
      onCloseTab={(id) => {
        if (id === SETTINGS_TAB.id) requestNavigation(closeSettings)
      }}
      settingsOpen={settingsOpen}
      onToggleSettings={toggleSettings}
    >
      {current.kind === 'overview' ? <ProductPreview title="Overview" /> : null}
      {current.kind === 'traffic' ? <ProductPreview title="Traffic" /> : null}
      {current.kind === 'settings' ? (
        <Settings capabilities={capabilities} request={request} />
      ) : null}
      <SurfaceActivity>
        <WorkspaceRail
          tabs={tabs}
          current={current.id}
          onSelect={(id) => setActiveTab(id)}
        />
      </SurfaceActivity>
    </AppFrame>
  )
}

function SettingsPreview(): ReactElement {
  return (
    <UnsavedChangesProvider>
      <PreviewFrame />
    </UnsavedChangesProvider>
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
