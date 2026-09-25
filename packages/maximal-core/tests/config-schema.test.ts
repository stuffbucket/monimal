import { SearchConnectorConfigSchema } from "@stuffbucket/maximal-harness"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { z } from "zod"

import {
  ConfigValidationError,
  detectUnknownKeys,
  validateAppConfig,
} from "~/lib/config/config-schema"
import { installConnectorPlugins } from "~/lib/config/connector-plugins"
import { resolveSettingsEnvironment } from "~/lib/config/settings-environment"

beforeEach(() => installConnectorPlugins([]))
afterEach(() => installConnectorPlugins([]))

describe("settings environment overrides", () => {
  const schema = z
    .object({
      terminalDiagnostics: z.boolean().optional(),
      ui: z.object({ menuBarOnly: z.boolean().optional() }).optional(),
      count: z.number().int().min(0).optional(),
      name: z.string().optional(),
      mode: z.enum(["safe", "full"]).optional(),
      tools: z.array(z.string()).optional(),
    })
    .loose()

  it("resolves absent optional keys and preserves persisted values", () => {
    const stored = { terminalDiagnostics: true, future: { retained: 1 } }
    expect(
      resolveSettingsEnvironment(schema, stored, {
        MAXIMAL_TERMINAL_DIAGNOSTICS: "false",
        MAXIMAL_UI_MENU_BAR_ONLY: "true",
        MAXIMAL_COUNT: "0",
        MAXIMAL_NAME: "123",
        MAXIMAL_MODE: "safe",
        MAXIMAL_TOOLS: '["app"]',
        MAXIMAL_BUILD_CONTROL: "not a setting",
      }),
    ).toEqual({
      terminalDiagnostics: false,
      ui: { menuBarOnly: true },
      count: 0,
      name: "123",
      mode: "safe",
      tools: ["app"],
      future: { retained: 1 },
    })
    expect(stored).toEqual({
      terminalDiagnostics: true,
      future: { retained: 1 },
    })
    expect(resolveSettingsEnvironment(schema, {}, {})).toEqual({})
  })

  it.each(["yes", "1", "", "null", "private-value"])(
    "rejects invalid booleans without exposing %s",
    (raw) => {
      expect(() =>
        resolveSettingsEnvironment(
          schema,
          {},
          {
            MAXIMAL_TERMINAL_DIAGNOSTICS: raw,
          },
        ),
      ).toThrow(
        "Invalid MAXIMAL_TERMINAL_DIAGNOSTICS override for terminalDiagnostics",
      )
    },
  )

  it("validates numeric bounds and ambiguous derived names", () => {
    expect(() =>
      resolveSettingsEnvironment(schema, {}, { MAXIMAL_COUNT: "-1" }),
    ).toThrow("Invalid MAXIMAL_COUNT override for count")
    expect(() =>
      resolveSettingsEnvironment(
        z.object({
          fooBar: z.boolean().optional(),
          foo_bar: z.boolean().optional(),
        }),
        {},
        {},
      ),
    ).toThrow("Ambiguous setting environment name: MAXIMAL_FOO_BAR")
  })
})

describe("validateAppConfig", () => {
  it("accepts an empty config", () => {
    expect(validateAppConfig({})).toEqual({})
  })

  it("accepts a realistic config", () => {
    const config = {
      smallModel: "gpt-5-mini",
      useMessagesApi: true,
      useFunctionApplyPatch: true,
      providers: {
        openrouter: {
          enabled: true,
          baseUrl: "https://openrouter.ai/api",
          apiKey: "sk-or-...",
          authType: "authorization" as const,
        },
      },
      modelReasoningEfforts: {
        "gpt-5.5": "xhigh" as const,
      },
    }
    expect(validateAppConfig(config)).toEqual(config)
  })

  it("accepts an Ollama compatibility provider without credentials", () => {
    const config = {
      providers: {
        ollama: {
          type: "ollama",
          enabled: true,
        },
      },
    }
    expect(validateAppConfig(config)).toEqual(config)
  })

  it("preserves opaque provider plugin config", () => {
    const config = {
      providerHost: {
        mode: "dsh" as const,
        profileDirectory: "/tmp/maximal-providers",
      },
      providerPlugins: {
        anthropic: {
          enabled: true,
          futurePluginField: "preserved",
          config: {
            nested: { arbitrary: [1, "two", { three: true }] },
            credentialReference: null,
          },
        },
      },
    }

    expect(validateAppConfig(config)).toEqual(config)
  })

  it("preserves opaque runtime connector config", () => {
    const config = {
      connectors: {
        search: {
          pluginOwned: { nested: [1, "two", { three: true }] },
        },
        futureConnector: {
          arbitrary: null,
        },
      },
    }

    expect(validateAppConfig(config)).toEqual(config)
  })

  it("delegates installed connector payloads to their plugin schema", () => {
    installConnectorPlugins([
      { id: "search", Config: SearchConnectorConfigSchema },
    ])
    expect(() =>
      validateAppConfig({
        connectors: { search: { defaults: { maxResults: 0 } } },
      }),
    ).toThrow("connectors.search.defaults.maxResults")
  })

  it("accepts 'max' reasoning effort (GPT-5.6 ladder top)", () => {
    // Regression for the boot-rejection bug: before "max" was added to
    // ReasoningEffortSchema, a config setting any model's effort to the top of
    // the GPT-5.6 ladder failed validation and the proxy exited non-zero.
    const config = {
      modelReasoningEfforts: {
        "gpt-5.6-sol": "max" as const,
      },
    }
    expect(validateAppConfig(config)).toEqual(config)
  })

  it("rejects a typo'd authType with the offending key path", () => {
    let thrown: ConfigValidationError | null = null
    try {
      validateAppConfig({
        providers: {
          openrouter: {
            authType: "bearer", // not a valid value
          },
        },
      })
    } catch (e) {
      if (e instanceof ConfigValidationError) thrown = e
    }
    expect(thrown).not.toBeNull()
    const issue = thrown?.issues.find((i) => i.path.includes("authType"))
    expect(issue?.path).toBe("providers.openrouter.authType")
  })

  it("rejects a wrong type with key path", () => {
    let thrown: ConfigValidationError | null = null
    try {
      validateAppConfig({ useMessagesApi: "yes" })
    } catch (e) {
      if (e instanceof ConfigValidationError) thrown = e
    }
    expect(thrown).not.toBeNull()
    expect(thrown?.issues[0].path).toBe("useMessagesApi")
  })

  it("accepts the autoRecoverAccount opt-in flag (boolean)", () => {
    expect(validateAppConfig({ autoRecoverAccount: true })).toEqual({
      autoRecoverAccount: true,
    })
  })

  it("rejects a non-boolean autoRecoverAccount with its key path", () => {
    let thrown: ConfigValidationError | null = null
    try {
      validateAppConfig({ autoRecoverAccount: "yes" })
    } catch (e) {
      if (e instanceof ConfigValidationError) thrown = e
    }
    expect(thrown).not.toBeNull()
    expect(thrown?.issues[0].path).toBe("autoRecoverAccount")
  })

  it("rejects a bad reasoning effort value", () => {
    let thrown: ConfigValidationError | null = null
    try {
      validateAppConfig({
        modelReasoningEfforts: { "gpt-5": "ULTRA" },
      })
    } catch (e) {
      if (e instanceof ConfigValidationError) thrown = e
    }
    expect(thrown).not.toBeNull()
    expect(thrown?.issues[0].path).toBe("modelReasoningEfforts.gpt-5")
  })

  it("keeps unknown top-level keys (passthrough)", () => {
    const config = { useMessagesApi: true, futureFlag: "not-yet-typed" }
    const parsed = validateAppConfig(config) as typeof config
    expect(parsed.futureFlag).toBe("not-yet-typed")
  })
})

describe("detectUnknownKeys", () => {
  it("returns unknown top-level keys", () => {
    expect(
      detectUnknownKeys({
        useMessagesApi: true,
        futureFlag: 1,
        anotherFutureFlag: 2,
      }),
    ).toEqual(["futureFlag", "anotherFutureFlag"])
  })

  it("returns empty array for fully-known config", () => {
    expect(
      detectUnknownKeys({ useMessagesApi: true, smallModel: "gpt-5-mini" }),
    ).toEqual([])
  })

  it("returns empty array for non-object input", () => {
    expect(detectUnknownKeys(null)).toEqual([])
    expect(detectUnknownKeys("string")).toEqual([])
    expect(detectUnknownKeys([])).toEqual([])
  })
})
