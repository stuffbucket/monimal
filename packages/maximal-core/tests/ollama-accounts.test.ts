import { describe, expect, test } from "bun:test"

import type { ResolvedOllamaProviderConfig } from "~/lib/config/config"

import { listOllamaAccounts } from "~/services/providers/ollama-accounts"

describe("Ollama account status", () => {
  test("represents available localhost Ollama without an account", async () => {
    const result = await listOllamaAccounts({}, (provider) => {
      expect(provider.name).toBe("ollama")
      expect(provider.apiKey).toBeUndefined()
      return Promise.resolve(
        Response.json({
          object: "list",
          data: [{ id: "qwen3" }, { id: "llama3.2" }],
        }),
      )
    })

    expect(result).toEqual({
      accounts: [
        {
          type: "ollama",
          provider: "ollama",
          endpoint: "http://127.0.0.1:11434",
          scope: "localhost",
          account_state: "unauthenticated",
          availability: "available",
          model_count: 2,
          error_code: null,
        },
      ],
    })
  })

  test("represents configured authenticated remote Ollama", async () => {
    const inspected: Array<ResolvedOllamaProviderConfig> = []
    const result = await listOllamaAccounts(
      {
        providers: {
          "ollama-cloud": {
            type: "ollama",
            baseUrl: "https://ollama.example/v1/",
            apiKey: "test-account-token",
          },
        },
      },
      (provider) => {
        inspected.push(provider)
        return Promise.resolve(new Response(null, { status: 503 }))
      },
    )

    expect(inspected).toHaveLength(2)
    expect(inspected.find(({ name }) => name === "ollama-cloud")?.apiKey).toBe(
      "test-account-token",
    )
    expect(result.accounts).toEqual([
      {
        type: "ollama",
        provider: "ollama",
        endpoint: "http://127.0.0.1:11434",
        scope: "localhost",
        account_state: "unauthenticated",
        availability: "unavailable",
        model_count: null,
        error_code: "HTTP 503",
      },
      {
        type: "ollama",
        provider: "ollama-cloud",
        endpoint: "https://ollama.example/v1",
        scope: "remote",
        account_state: "authenticated",
        availability: "unavailable",
        model_count: null,
        error_code: "HTTP 503",
      },
    ])
  })

  test("reports a transport error code without exposing its message", async () => {
    const result = await listOllamaAccounts({}, () => {
      const cause = new Error("connect ECONNREFUSED 127.0.0.1")
      Object.assign(cause, { code: "ECONNREFUSED" })
      return Promise.reject(new TypeError("fetch failed", { cause }))
    })

    expect(result.accounts[0]?.error_code).toBe("ECONNREFUSED")
  })

  test("omits explicitly disabled Ollama providers", async () => {
    const providers: Array<string> = []
    const result = await listOllamaAccounts(
      {
        providers: {
          ollama: {
            type: "ollama",
            enabled: false,
            baseUrl: "https://disabled.example",
          },
        },
      },
      (provider) => {
        providers.push(provider.baseUrl)
        return Promise.resolve(Response.json({ data: [] }))
      },
    )

    expect(providers).toEqual([])
    expect(result.accounts).toEqual([])
  })
})
