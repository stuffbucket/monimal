import type {
  ConnectorSettings,
  SearchProvider,
  SearchProviderInstance,
} from "../../search.js"

export const COPILOT_SEARCH_PROVIDER_ID = "copilot"
export const DEFAULT_COPILOT_SEARCH_MODEL = "gpt-5-mini"

export interface CopilotSearchModelOption {
  readonly label: string
  readonly value: string
}

export function copilotSearchProvider(
  bind: (settings: ConnectorSettings) => SearchProviderInstance,
  modelOptions: ReadonlyArray<CopilotSearchModelOption> = [
    {
      label: DEFAULT_COPILOT_SEARCH_MODEL,
      value: DEFAULT_COPILOT_SEARCH_MODEL,
    },
  ],
): SearchProvider {
  return {
    id: COPILOT_SEARCH_PROVIDER_ID,
    label: "GitHub Copilot search",
    description: "Broker search through a model served by Copilot Responses.",
    capabilities: ["search", "fetch"],
    settings: [
      {
        key: "model",
        type: "select",
        label: "Broker model",
        description: "Model used to broker search through Copilot Responses.",
        default: DEFAULT_COPILOT_SEARCH_MODEL,
        options: modelOptions,
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
