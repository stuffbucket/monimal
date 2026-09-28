import type {
  ConnectorSettings,
  SearchProvider,
  SearchProviderInstance,
} from "../connector.js"
import { MAX_RESULTS_FIELD, TIMEOUT_FIELD } from "./fields.js"

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
        required: true,
        format: "url",
        layout: "full",
        emptyDescription: "Uses https://html.duckduckgo.com/html/ when empty.",
      },
      TIMEOUT_FIELD,
      MAX_RESULTS_FIELD,
    ],
    create: bind,
  }
}
