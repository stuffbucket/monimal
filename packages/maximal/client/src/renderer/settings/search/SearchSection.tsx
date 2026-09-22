import { type ReactElement } from 'react'

import {
  Note,
} from 'stuffbucket-electron/renderer'

import type {
  SettingsCapabilities,
} from '../capabilities'
import { SearchDomainFilteringSection } from './SearchDomainFilteringSection'
import { SearchProviderOrderSection } from './SearchProviderOrderSection'
import { useSearchSettings } from './useSearchSettings'

interface SearchSectionProps {
  capabilities: SettingsCapabilities
}

export function SearchSection({
  capabilities,
}: SearchSectionProps): ReactElement {
  const {
    snapshot,
    updates,
    busy,
    error,
    providerChecks,
    setGlobal,
    setProviderLayout,
    setProviderSetting,
    validateProviderForEnable,
  } = useSearchSettings(capabilities)

  return (
    <section className="settings-section">
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {snapshot === null ? (
        <Note live="polite">Loading search settings…</Note>
      ) : (
        <div className="settings-connector-form">
          <Note>{snapshot.manifest.description}</Note>
          <SearchProviderOrderSection
            snapshot={snapshot}
            updates={updates}
            busy={busy}
            providerChecks={providerChecks}
            onGlobalChange={setGlobal}
            onProviderLayoutChange={setProviderLayout}
            onProviderSettingChange={setProviderSetting}
            onValidateProvider={validateProviderForEnable}
          />
          <SearchDomainFilteringSection
            snapshot={snapshot}
            updates={updates}
            busy={busy}
            onGlobalChange={setGlobal}
          />
        </div>
      )}
    </section>
  )
}