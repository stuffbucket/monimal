import { describe, expect, test } from "bun:test"

import type { AppConfig } from "~/lib/config/config"
import type { Model } from "~/services/copilot/get-models"

import {
  buildSearchSettings,
  SettingsOperationError,
  updateSearchSettings,
} from "~/lib/config/settings-operations"

function model(
  id: string,
  name: string,
  {
    endpoints,
    modelPickerEnabled = true,
  }: { endpoints: Array<string>; modelPickerEnabled?: boolean },
): Model {
  return {
    id,
    name,
    model_picker_enabled: modelPickerEnabled,
    supported_endpoints: endpoints,
    capabilities: {
      family: id,
      limits: {},
      object: "model_capabilities",
      supports: {},
      tokenizer: "o200k_base",
      type: "chat",
    },
    object: "model",
    preview: false,
    vendor: "OpenAI",
    version: "1",
  }
}

test("search settings present provider defaults and display metadata", () => {
  const response = buildSearchSettings({}, {}, [])
  const ollama = response.manifest.providers.find(({ id }) => id === "ollama")
  const duckDuckGo = response.manifest.providers.find(
    ({ id }) => id === "duckduckgo",
  )

  expect(ollama?.settings).toMatchObject([
    { key: "apiKey", required: true, layout: "full" },
    {
      key: "baseUrl",
      required: true,
      format: "url",
      layout: "full",
    },
    {
      key: "timeoutMs",
      label: "Timeout (s)",
      default: 30_000,
      unit: "seconds",
    },
    { key: "maxResults", default: 5 },
  ])
  expect(duckDuckGo?.settings).toMatchObject([
    { key: "searchUrl", format: "url", layout: "full" },
    {
      key: "timeoutMs",
      label: "Timeout (s)",
      default: 30_000,
      unit: "seconds",
    },
    { key: "maxResults", default: 5 },
  ])
})

describe("search settings operations", () => {
  test("offers available Copilot Responses models with gpt-5-mini as default", () => {
    const response = buildSearchSettings({}, {}, [
      model("gpt-5.6-sol", "GPT-5.6 Sol", { endpoints: ["/responses"] }),
      model("gpt-5-mini", "GPT-5 mini", { endpoints: ["/responses"] }),
      model("chat-only", "Chat only", {
        endpoints: ["/chat/completions"],
      }),
      model("hidden", "Hidden", {
        endpoints: ["/responses"],
        modelPickerEnabled: false,
      }),
    ])
    const copilot = response.manifest.providers.find(
      (provider) => provider.id === "copilot",
    )
    const brokerModel = copilot?.settings?.find(
      (field) => field.key === "model",
    )

    expect(brokerModel).toEqual({
      key: "model",
      type: "select",
      label: "Broker model",
      description: "Model used to broker search through Copilot Responses.",
      default: "gpt-5-mini",
      options: [
        { label: "GPT-5 mini", value: "gpt-5-mini" },
        { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
      ],
    })
  })

  test("redacts secrets and reports their effective source", () => {
    const fromSettings = buildSearchSettings(
      {
        connectors: {
          search: {
            providers: {
              ollama: { settings: { apiKey: "saved-secret" } },
            },
          },
        },
      },
      { OLLAMA_API_KEY: "environment-secret" },
    )

    expect(fromSettings.providers.ollama.settings.apiKey).toBeUndefined()
    expect(fromSettings.providers.ollama.secret_sources.apiKey).toBe("settings")
    expect(JSON.stringify(fromSettings)).not.toContain("saved-secret")
    expect(JSON.stringify(fromSettings)).not.toContain("environment-secret")

    const fromEnvironment = buildSearchSettings(
      {},
      {
        OLLAMA_API_KEY: "environment-secret",
      },
    )
    expect(fromEnvironment.providers.ollama.secret_sources.apiKey).toBe(
      "environment",
    )
  })

  test("validates values from provider descriptors", () => {
    const current: AppConfig = {}

    expect(() =>
      updateSearchSettings(
        { providers: { duckduckgo: { settings: { timeoutMs: 999 } } } },
        {
          env: {},
          getConfig: () => current,
          getModels: () => [],
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("duckduckgo.timeoutMs: Timeout (s) must be at least 1 seconds.")

    expect(() =>
      updateSearchSettings(
        {
          providers: {
            duckduckgo: { settings: { searchUrl: "ftp://example.com" } },
          },
        },
        {
          env: {},
          getConfig: () => current,
          getModels: () => [],
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("Search URL must be a valid HTTP or HTTPS URL.")

    expect(() =>
      updateSearchSettings(
        { settings: { priority: [] } },
        {
          env: {},
          getConfig: () => current,
          getModels: () => [],
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("search.priority: Provider priority is required.")

    expect(() =>
      updateSearchSettings(
        { settings: { blockedDomains: ["   "] } },
        {
          env: {},
          getConfig: () => current,
          getModels: () => [],
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("Blocked domains entries cannot be empty.")
  })
})

describe("search provider settings operations", () => {
  test("requires effective Ollama credentials before enabling the provider", () => {
    const dependencies = {
      env: {},
      getConfig: () => ({
        connectors: { search: { providers: { ollama: { enabled: false } } } },
      }),
      getModels: () => [],
      writeConfig: (next: AppConfig) => next,
    }

    expect(() =>
      updateSearchSettings(
        { providers: { ollama: { enabled: true } } },
        dependencies,
      ),
    ).toThrow(
      /Ollama hosted search cannot be enabled: ollama\.apiKey: API key is required\..*OLLAMA_API_KEY/u,
    )

    expect(() =>
      updateSearchSettings(
        { providers: { ollama: { enabled: true } } },
        { ...dependencies, env: { OLLAMA_API_KEY: "environment-secret" } },
      ),
    ).not.toThrow()
  })

  test("clears secrets and preserves unrelated configuration", () => {
    let persisted: AppConfig = {
      smallModel: "gpt-5-mini",
      connectors: {
        search: {
          priority: ["ollama", "duckduckgo"],
          providers: {
            ollama: {
              enabled: true,
              settings: {
                apiKey: "saved-secret",
                baseUrl: "https://ollama.test",
              },
            },
            duckduckgo: { settings: { maxResults: 3 } },
          },
        },
      },
    }

    const response = updateSearchSettings(
      {
        settings: { fallback: false, maxResults: 8 },
        providers: {
          ollama: { settings: { apiKey: null } },
        },
      },
      {
        env: { OLLAMA_API_KEY: "environment-secret" },
        getConfig: () => persisted,
        getModels: () => [],
        writeConfig: (next) => {
          persisted = next
          return next
        },
      },
    )

    expect(persisted).toMatchObject({
      smallModel: "gpt-5-mini",
      connectors: {
        search: {
          fallback: false,
          defaults: { maxResults: 8 },
          providers: {
            ollama: { settings: { baseUrl: "https://ollama.test" } },
            duckduckgo: { settings: { maxResults: 3 } },
          },
        },
      },
    })
    const ollamaSettings =
      persisted.connectors?.search?.providers?.ollama.settings
    expect(ollamaSettings?.apiKey).toBeUndefined()
    expect(response.providers.ollama.secret_sources.apiKey).toBe("environment")
  })

  test("accepts only Copilot models offered by the live Responses catalog", () => {
    let persisted: AppConfig = {}
    const models = [
      model("gpt-5-mini", "GPT-5 mini", { endpoints: ["/responses"] }),
      model("gpt-5.6-sol", "GPT-5.6 Sol", { endpoints: ["/responses"] }),
      model("chat-only", "Chat only", {
        endpoints: ["/chat/completions"],
      }),
    ]
    const dependencies = {
      env: {},
      getConfig: () => persisted,
      getModels: () => models,
      writeConfig: (next: AppConfig) => {
        persisted = next
        return next
      },
    }

    updateSearchSettings(
      { providers: { copilot: { settings: { model: "gpt-5.6-sol" } } } },
      dependencies,
    )
    expect(
      persisted.connectors?.search?.providers?.copilot.settings?.model,
    ).toBe("gpt-5.6-sol")
    expect(() =>
      updateSearchSettings(
        { providers: { copilot: { settings: { model: "chat-only" } } } },
        dependencies,
      ),
    ).toThrow(SettingsOperationError)
  })
})
