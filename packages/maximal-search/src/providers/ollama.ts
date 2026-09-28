import type {
  ConnectorSettings,
  SearchProvider,
  SearchProviderInstance,
} from "../connector.js"
import { MAX_RESULTS_FIELD, TIMEOUT_FIELD } from "./fields.js"

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
        placeholder: "Paste your Ollama API key",
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
        placeholder: "https://ollama.com/api",
        required: true,
        format: "url",
        validation: {
          url: { protocols: ["https:"], pathname: "/api" },
          message: "Base URL must be an HTTPS origin followed by /api.",
        },
        layout: "full",
        emptyDescription: "Uses https://ollama.com/api when empty.",
      },
      TIMEOUT_FIELD,
      MAX_RESULTS_FIELD,
    ],
    credentialProbe: {
      secretKey: "apiKey",
      baseUrlKey: "baseUrl",
      environmentVariable: "OLLAMA_API_KEY",
      path: "/web_search",
      body: { query: "maximal credential validation", max_results: 1 },
    },
    effectiveSetting: (key, configured) =>
      key === "apiKey" ? (configured ?? environmentApiKey) : configured,
    secretSource: (key, configured) =>
      key === "apiKey" && configured === undefined && environmentApiKey ?
        "environment"
      : undefined,
    create: bind,
  }
}
