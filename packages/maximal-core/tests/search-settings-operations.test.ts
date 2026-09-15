import { describe, expect, test } from "bun:test"

import type { AppConfig } from "~/lib/config/config"
import type { Model } from "~/services/copilot/get-models"

import { parseConnectorConfig } from "~/lib/config/connector-plugins"
import {
  buildSearchSettings,
  SettingsOperationError,
  updateSearchSettings,
  validateSearchProvider,
} from "~/lib/config/settings-operations"
import { createBuiltinSearchConnectorPlugin } from "~/routes/messages/web-tools/executor"

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
  const response = buildSearchSettings({}, createBuiltinSearchConnectorPlugin())
  const ollama = response.manifest.providers.find(({ id }) => id === "ollama")
  const duckDuckGo = response.manifest.providers.find(
    ({ id }) => id === "duckduckgo",
  )

  expect(ollama?.settings).toMatchObject([
    {
      key: "apiKey",
      required: true,
      layout: "full",
      helpLink: {
        label: "Create or manage an API key",
        url: "https://ollama.com/settings/keys",
      },
    },
    {
      key: "baseUrl",
      required: true,
      format: "url",
      layout: "full",
    },
    {
      key: "timeoutMs",
      label: "Timeout (s)",
      default: 300_000,
      unit: "seconds",
    },
    { key: "maxResults", default: 5 },
  ])
  expect(duckDuckGo?.settings).toMatchObject([
    { key: "searchUrl", format: "url", layout: "full" },
    {
      key: "timeoutMs",
      label: "Timeout (s)",
      default: 300_000,
      unit: "seconds",
    },
    { key: "maxResults", default: 5 },
  ])
  expect(response.providers.ollama.enabled).toBe(false)
  expect(response.providers.copilot.enabled).toBe(true)
  expect(response.providers.duckduckgo.enabled).toBe(true)
})

test("search settings enable Ollama immediately when its required key is available", () => {
  const response = buildSearchSettings(
    {},
    createBuiltinSearchConnectorPlugin({
      env: { OLLAMA_API_KEY: "environment-secret" },
    }),
  )

  expect(response.providers.ollama.enabled).toBe(true)
})

describe("search settings operations", () => {
  test("offers available Copilot Responses models with gpt-5-mini as default", () => {
    const response = buildSearchSettings(
      {},
      createBuiltinSearchConnectorPlugin({
        models: () => [
          model("gpt-5.6-sol", "GPT-5.6 Sol", { endpoints: ["/responses"] }),
          model("gpt-5-mini", "GPT-5 mini", { endpoints: ["/responses"] }),
          model("chat-only", "Chat only", {
            endpoints: ["/chat/completions"],
          }),
          model("hidden", "Hidden", {
            endpoints: ["/responses"],
            modelPickerEnabled: false,
          }),
        ],
      }),
    )
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
    const plugin = createBuiltinSearchConnectorPlugin({
      env: { OLLAMA_API_KEY: "environment-secret" },
    })
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
      plugin,
    )

    expect(fromSettings.providers.ollama.settings.apiKey).toBeUndefined()
    expect(fromSettings.providers.ollama.secret_sources.apiKey).toBe("settings")
    expect(JSON.stringify(fromSettings)).not.toContain("saved-secret")
    expect(JSON.stringify(fromSettings)).not.toContain("environment-secret")

    const fromEnvironment = buildSearchSettings({}, plugin)
    expect(fromEnvironment.providers.ollama.secret_sources.apiKey).toBe(
      "environment",
    )
  })

  test("validates values from provider descriptors", () => {
    const current: AppConfig = {}
    const plugin = createBuiltinSearchConnectorPlugin()

    expect(() =>
      updateSearchSettings(
        { providers: { duckduckgo: { settings: { timeoutMs: 999 } } } },
        {
          getConfig: () => current,
          getPlugin: () => plugin,
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
          getConfig: () => current,
          getPlugin: () => plugin,
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("Search URL must be a valid HTTP or HTTPS URL.")

    expect(() =>
      updateSearchSettings(
        {
          providers: {
            ollama: { settings: { baseUrl: "https://ollama.com" } },
          },
        },
        {
          getConfig: () => current,
          getPlugin: () => plugin,
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("Base URL must be an HTTPS origin followed by /api.")

    expect(() =>
      updateSearchSettings(
        { settings: { priority: [] } },
        {
          getConfig: () => current,
          getPlugin: () => plugin,
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("search.priority: Provider priority is required.")

    expect(() =>
      updateSearchSettings(
        { settings: { blockedDomains: ["   "] } },
        {
          getConfig: () => current,
          getPlugin: () => plugin,
          writeConfig: (next) => next,
        },
      ),
    ).toThrow("Blocked domains entries cannot be empty.")
  })
})

describe("search provider settings operations", () => {
  test.each([
    [200, "valid", {}],
    [
      401,
      "invalid",
      { apiKey: "API key was rejected by Ollama hosted search." },
    ],
    [
      403,
      "invalid",
      { apiKey: "API key was rejected by Ollama hosted search." },
    ],
    [404, "invalid", { baseUrl: "Base URL does not expose /web_search." }],
  ] as const)(
    "validates Ollama credentials without exposing them (HTTP %i)",
    async (status, expectedStatus, fieldErrors) => {
      const apiKey = "never-return-this-secret"
      const plugin = createBuiltinSearchConnectorPlugin({ env: {} })
      let request: { url: string; apiKey: string; authType: string } | undefined
      const result = await validateSearchProvider(
        {
          providerId: "ollama",
          settings: { apiKey, baseUrl: "https://ollama.test/api" },
        },
        {
          env: {},
          getConfig: () => ({}),
          getPlugin: () => plugin,
          request: (credential, url) => {
            request = {
              url,
              apiKey: credential.apiKey,
              authType: credential.authType,
            }
            return Promise.resolve(new Response(null, { status }))
          },
        },
      )

      expect(request).toEqual({
        url: "https://ollama.test/api/web_search",
        apiKey,
        authType: "authorization",
      })
      expect(result).toMatchObject({ status: expectedStatus, fieldErrors })
      expect(JSON.stringify(result)).not.toContain(apiKey)
    },
  )

  test("reports an unreachable provider separately from rejected credentials", async () => {
    const plugin = createBuiltinSearchConnectorPlugin({ env: {} })
    const result = await validateSearchProvider(
      {
        providerId: "ollama",
        settings: {
          apiKey: "never-return-this-secret",
          baseUrl: "https://ollama.test/api",
        },
      },
      {
        env: {},
        getConfig: () => ({}),
        getPlugin: () => plugin,
        request: () => Promise.reject(new Error("network down")),
      },
    )

    expect(result).toEqual({
      status: "unavailable",
      fieldErrors: {},
      message:
        "Ollama hosted search could not be reached to verify these settings.",
    })
  })

  test("requires effective Ollama credentials before enabling the provider", () => {
    const plugin = createBuiltinSearchConnectorPlugin({ env: {} })
    const dependencies = {
      getConfig: () => ({
        connectors: { search: { providers: { ollama: { enabled: false } } } },
      }),
      getPlugin: () => plugin,
      writeConfig: (next: AppConfig) => next,
    }

    expect(() =>
      updateSearchSettings(
        { providers: { ollama: { enabled: true } } },
        dependencies,
      ),
    ).toThrow(
      /Ollama hosted search cannot be enabled: ollama\.apiKey: API key is required\./u,
    )

    expect(() =>
      updateSearchSettings(
        { providers: { ollama: { enabled: true } } },
        {
          ...dependencies,
          getPlugin: () =>
            createBuiltinSearchConnectorPlugin({
              env: { OLLAMA_API_KEY: "environment-secret" },
            }),
        },
      ),
    ).not.toThrow()
  })

  test("clears secrets and preserves unrelated configuration", () => {
    const plugin = createBuiltinSearchConnectorPlugin({
      env: { OLLAMA_API_KEY: "environment-secret" },
    })
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
                baseUrl: "https://ollama.test/api",
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
        getConfig: () => persisted,
        getPlugin: () => plugin,
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
            ollama: { settings: { baseUrl: "https://ollama.test/api" } },
            duckduckgo: { settings: { maxResults: 3 } },
          },
        },
      },
    })
    const ollamaSettings = parseConnectorConfig(plugin, persisted.connectors)
      .providers?.ollama.settings
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
    const plugin = createBuiltinSearchConnectorPlugin({ models: () => models })
    const dependencies = {
      getConfig: () => persisted,
      getPlugin: () => plugin,
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
      parseConnectorConfig(plugin, persisted.connectors).providers?.copilot
        .settings?.model,
    ).toBe("gpt-5.6-sol")
    expect(() =>
      updateSearchSettings(
        { providers: { copilot: { settings: { model: "chat-only" } } } },
        dependencies,
      ),
    ).toThrow(SettingsOperationError)
  })
})
