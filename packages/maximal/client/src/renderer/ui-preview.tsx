import { StrictMode, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import './theme'
import './base'
import 'stuffbucket-electron/renderer/styles.css'

import { AppFrame, PRODUCT_TABS } from './frame/AppFrame'
import { Settings } from './settings/Settings'
import { createPreviewSettingsCapabilities } from './settings/ui-preview-capabilities'
import { UnsavedChangesProvider } from './unsaved-changes'

const capabilities = createPreviewSettingsCapabilities()

function SearchSettingsPreview(): ReactElement {
  return (
    <UnsavedChangesProvider>
      <AppFrame
        tabs={PRODUCT_TABS}
        activeTab="settings"
        surface="settings"
        onSelectTab={() => undefined}
      >
        <Settings
          capabilities={capabilities}
          request={{ id: 'settings-search-heading' }}
        />
      </AppFrame>
    </UnsavedChangesProvider>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <SearchSettingsPreview />
    </StrictMode>,
  )
}
