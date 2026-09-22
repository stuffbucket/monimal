import { type ReactElement } from 'react'
import { Info } from 'lucide-react'

import {
  IconButton,
  SettingsSection,
} from 'stuffbucket-electron/renderer'

import type {
  ConnectorSettingValue,
  SearchSettingsResponse,
  SearchSettingsUpdateRequest,
} from '../capabilities'
import { settingFieldError } from './search-field-state'
import { SearchSettingControl } from './SearchSettingControl'
import { fieldValue } from './search-settings-helpers'

const DOMAIN_HELP: Record<string, string> = {
  allowedDomains:
    'When this list has entries, search results must come from one of these domains. Subdomains are included, and a request can narrow the list further. Leave it empty to allow any domain that is not blocked.',
  blockedDomains:
    'Results from these domains are removed from every provider. Subdomains are included, and this list still applies when a request supplies its own filters. If a domain appears in both lists, blocked wins.',
}

interface SearchDomainFilteringSectionProps {
  snapshot: SearchSettingsResponse
  updates: SearchSettingsUpdateRequest
  busy: boolean
  onGlobalChange: (key: string, value: ConnectorSettingValue | null) => void
}

function isDomainField(key: string): boolean {
  return key === 'allowedDomains' || key === 'blockedDomains'
}

export function SearchDomainFilteringSection({
  snapshot,
  updates,
  busy,
  onGlobalChange,
}: SearchDomainFilteringSectionProps): ReactElement {
  return (
    <SettingsSection
      title="Domain filtering"
      description="Allow only selected sites or remove unwanted sites from every provider's results."
    >
      <div className="search-behavior">
        <div className="search-behavior__domains">
          {snapshot.manifest.fields
            .filter((field) => isDomainField(field.key))
            .map((field) => {
              const value = fieldValue(field, snapshot.settings, updates.settings)
              return (
                <div className="search-behavior__field" key={field.key}>
                  <SearchSettingControl
                    field={field}
                    testId={`search-setting-global-${field.key}`}
                    value={value}
                    disabled={busy}
                    error={settingFieldError(field, value)}
                    labelAction={
                      <IconButton
                        label={`About ${field.label.toLowerCase()}`}
                        tooltip={DOMAIN_HELP[field.key]}
                        className="search-behavior__help"
                      >
                        <Info size={13} />
                      </IconButton>
                    }
                    onChange={(next) => onGlobalChange(field.key, next)}
                  />
                </div>
              )
            })}
        </div>
      </div>
    </SettingsSection>
  )
}