import type {
  ConnectorSettings,
  SearchProvider,
  SearchProviderInstance,
} from "../../search.js"

export const OLLAMA_SEARCH_PROVIDER_ID = "ollama"

export function ollamaSearchProvider(
  bind: (settings: ConnectorSettings) => SearchProviderInstance,
): SearchProvider {
  return {
    id: OLLAMA_SEARCH_PROVIDER_ID,
    label: "Ollama hosted search",
    description: "Search and fetch through ollama.com using an API key.",
    capabilities: ["search", "fetch"],
    settings: [
      {
        key: "apiKey",
        type: "secret",
        label: "API key",
        description: "Overrides OLLAMA_API_KEY when set.",
      },
      {
        key: "baseUrl",
        type: "string",
        label: "Base URL",
        default: "https://ollama.com/api",
      },
      {
        key: "timeoutMs",
        type: "integer",
        label: "Timeout (ms)",
        default: 30_000,
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
