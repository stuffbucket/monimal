import { describe, expect, test } from "bun:test"

import { assertGenericProviderBundle } from "../scripts/build"

describe("provider bundle boundary", () => {
  test("accepts Core, the contract, and the generic host", () => {
    expect(() =>
      assertGenericProviderBundle({
        inputs: {
          "../maximal-core/dist/cli.js": {},
          "../maximal-provider-contract/dist/index.js": {},
          "../maximal-dsh-host/dist/index.js": {},
          "src/main.ts": {},
        },
      }),
    ).not.toThrow()
  })

  test.each([
    "../omlx/node_modules/@stuffbucket/omlx/dist/index.js",
    "../anthropic/node_modules/@stuffbucket/anthropic-provider/dist/index.js",
    "../../node_modules/.pnpm/@deepseek-ai+cordis@4.0.1/node_modules/@deepseek-ai/cordis/lib/index.js",
    "../../node_modules/.pnpm/@deepseek-ai+dsh-llm@0.1.0-rc.6/node_modules/@deepseek-ai/dsh-llm/lib/index.js",
    "../../node_modules/.pnpm/@deepseek-ai+schemastery@3.18.1/node_modules/@deepseek-ai/schemastery/lib/index.js",
    "../../packages/omlx/dist/index.js",
    "../../packages/anthropic-provider/dist/index.js",
    "../omlx/dist/index.js",
    "../anthropic-provider/dist/index.js",
  ])("rejects external runtime input %s", (input) => {
    expect(() =>
      assertGenericProviderBundle({ inputs: { [input]: {} } }),
    ).toThrow("entered the Maximal bundle")
  })

  test("rejects malformed metafiles", () => {
    expect(() => assertGenericProviderBundle(null)).toThrow(
      "valid build metafile",
    )
    expect(() => assertGenericProviderBundle({ inputs: [] })).toThrow(
      "valid build metafile",
    )
  })
})
