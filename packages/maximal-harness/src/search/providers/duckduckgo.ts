import type {
  ConnectorSettings,
  SearchProvider,
  SearchProviderInstance,
} from "../../search.js"

export const DUCKDUCKGO_SEARCH_PROVIDER_ID = "duckduckgo"

export function duckDuckGoSearchProvider(
  bind: (settings: ConnectorSettings) => SearchProviderInstance,
): SearchProvider {
  return {
    id: DUCKDUCKGO_SEARCH_PROVIDER_ID,
    label: "DuckDuckGo fallback",
    description: "No-key HTML search with direct HTTPS page fetching.",
    capabilities: ["search", "fetch"],
    settings: [
      {
        key: "searchUrl",
        type: "string",
        label: "Search URL",
        default: "https://html.duckduckgo.com/html/",
      },
      {
        key: "timeoutMs",
        type: "integer",
        label: "Timeout (ms)",
        default: 15_000,
        min: 1_000,
        max: 120_000,
      },
      {
        key: "maxResults",
        type: "integer",
        label: "Provider result limit",
        default: 5,
        min: 1,
        max: 20,
      },
    ],
    create: bind,
  }
}
