import type {
  ConnectorSettings,
  SearchProvider,
  SearchProviderInstance,
} from "../../search.js"

export const OLLAMA_SEARCH_PROVIDER_ID = "ollama"

export function ollamaSearchProvider(
  bind: (settings: ConnectorSettings) => SearchProviderInstance,
  environmentApiKey?: string,
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
        description: "Use an Ollama API key to authorize hosted search.",
        helpLink: {
          label: "Create or manage an API key",
          url: "https://ollama.com/settings/keys",
        },
        required: true,
        layout: "full",
        emptyDescription: "Enter an Ollama API key below.",
      },
      {
        key: "baseUrl",
        type: "string",
        label: "Base URL",
        default: "https://ollama.com/api",
        required: true,
        format: "url",
        layout: "full",
        emptyDescription: "Uses https://ollama.com/api when empty.",
      },
      {
        key: "timeoutMs",
        type: "integer",
        label: "Timeout (s)",
        default: 300_000,
        min: 1_000,
        max: 600_000,
        unit: "seconds",
        emptyDescription: "Uses 300 seconds when empty.",
      },
      {
        key: "maxResults",
        type: "integer",
        label: "Provider result limit",
        default: 5,
        min: 1,
        max: 20,
        emptyDescription: "Uses 5 results when empty.",
      },
    ],
    effectiveSetting: (key, configured) =>
      key === "apiKey" ? (configured ?? environmentApiKey) : configured,
    secretSource: (key, configured) =>
      key === "apiKey" && configured === undefined && environmentApiKey ?
        "environment"
      : undefined,
    create: bind,
  }
}
