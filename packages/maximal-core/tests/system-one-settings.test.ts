import {
  SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS,
  SystemOneSettingsUpdateRequest,
} from "@maximal/maximal-core-contract/settings"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { DEFAULT_OLLAMA_BASE_URL } from "~/lib/config/config"
import { getSystemOneSettings } from "~/services/providers/system-one-settings"

const originalApiKey = process.env.TYPESAFE_API_KEY

beforeEach(() => {
  process.env.TYPESAFE_API_KEY = "typesafe-test-key"
})

afterEach(() => {
  if (originalApiKey === undefined) {
    Reflect.deleteProperty(process.env, "TYPESAFE_API_KEY")
  } else {
    process.env.TYPESAFE_API_KEY = originalApiKey
  }
})

describe("System One settings", () => {
  test("offers Ollama only when an enabled endpoint is configured", () => {
    expect(
      getSystemOneSettings({
        providers: {
          ollama: {
            baseUrl: DEFAULT_OLLAMA_BASE_URL,
            type: "ollama",
          },
        },
        systemOne: {
          localProvider: "ollama",
          modelOrder: ["tev1:0.8b", "nimble", "tev1"],
          fallbackToLocal: false,
        },
      }),
    ).toMatchObject({
      has_api_key: true,
      local_provider: "ollama",
      ollama_configured: true,
      model_order: ["tev1:0.8b", "nimble", "tev1"],
      model_download_urls: SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS,
      fallback_to_local: false,
    })

    expect(
      getSystemOneSettings({
        systemOne: { localProvider: "ollama" },
      }),
    ).toMatchObject({
      local_provider: "maximal",
      ollama_configured: false,
    })
  })

  test("requires an exact permutation of supported local models", () => {
    expect(() =>
      SystemOneSettingsUpdateRequest.parse({
        model_order: ["nimble", "nimble", "tev1"],
      }),
    ).toThrow(
      "System One model order must contain each supported local model exactly once.",
    )
  })

  test("uses pinned model artifacts and accepts HTTP download URL overrides", () => {
    const tev1DownloadOverride = `${SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS.tev1}?download=true`

    expect(getSystemOneSettings().model_download_urls).toEqual(
      SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS,
    )
    expect(
      getSystemOneSettings({
        systemOne: {
          modelDownloadUrls: {
            tev1: tev1DownloadOverride,
          },
        },
      }).model_download_urls,
    ).toEqual({
      ...SYSTEM_ONE_DEFAULT_MODEL_DOWNLOAD_URLS,
      tev1: tev1DownloadOverride,
    })
    expect(() =>
      SystemOneSettingsUpdateRequest.parse({
        model_download_urls: { tev1: "file:///tmp/tev1.gguf" },
      }),
    ).toThrow("System One model download URL must use HTTP or HTTPS")
  })
})
