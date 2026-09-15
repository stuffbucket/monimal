import type { ConnectorSettingField, SearchProvider } from "../search.js"

export const SEARCH_CONNECTOR_SETTINGS: ReadonlyArray<ConnectorSettingField> = [
  {
    key: "priority",
    type: "string-list",
    label: "Provider priority",
    description: "Provider ids in the order Maximal should try them.",
    required: true,
  },
  {
    key: "fallback",
    type: "boolean",
    label: "Fall back after transient failures",
    default: true,
  },
  {
    key: "maxResults",
    type: "integer",
    label: "Maximum results",
    description: "Upper bound applied after provider and domain filtering.",
    default: 5,
    min: 1,
    max: 20,
  },
  {
    key: "allowedDomains",
    type: "string-list",
    label: "Allowed domains",
    description: "Optional global allow-list; subdomains are included.",
  },
  {
    key: "blockedDomains",
    type: "string-list",
    label: "Blocked domains",
    description: "Global deny-list applied after every provider response.",
  },
]

export interface SearchSettingsManifest {
  readonly id: "search"
  readonly label: "Search"
  readonly description: string
  readonly fields: ReadonlyArray<ConnectorSettingField>
  readonly providers: ReadonlyArray<
    Pick<
      SearchProvider,
      "id" | "label" | "description" | "capabilities" | "settings"
    >
  >
}

export function buildSearchSettingsManifest(
  providers: ReadonlyArray<SearchProvider>,
): SearchSettingsManifest {
  const fields = SEARCH_CONNECTOR_SETTINGS.map((field) =>
    field.key === "priority" && field.type === "string-list" ?
      { ...field, default: providers.map(({ id }) => id) }
    : field,
  )
  return {
    id: "search",
    label: "Search",
    description: "Configure web search providers and other information sources.",
    fields,
    providers: providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      capabilities: provider.capabilities,
      ...(provider.description === undefined ? {} : {
        description: provider.description,
      }),
      ...(provider.settings === undefined ? {} : {
        settings: provider.settings,
      }),
    })),
  }
}
