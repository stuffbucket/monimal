import { describe, expect, test } from "bun:test"

import {
  findProviderHostImports,
  findProviderHostManifestDependencies,
} from "../scripts/provider-host-boundary"

describe("provider host dependency boundary", () => {
  test("allows only the frozen provider contract across the boundary", () => {
    const source = `
      import type { ProviderGateway } from "@stuffbucket/maximal-provider-contract"
      export type { ProviderDispatch } from "@stuffbucket/maximal-provider-contract"
    `

    expect(findProviderHostImports(source)).toEqual([])
  })

  test.each([
    "cordis",
    "@stuffbucket/maximal-dsh-host",
    "@stuffbucket/maximal-provider-omlx",
    "anthropic-provider",
  ])("rejects source imports of %s", (specifier) => {
    const source = `import gateway from ${JSON.stringify(specifier)}`

    expect(findProviderHostImports(source)).toEqual([
      { file: "source.ts", specifier },
    ])
  })

  test("rejects dynamic, require, import-type, and re-export forms", () => {
    const source = `
      import("cordis")
      require("@stuffbucket/maximal-dsh-host")
      type Host = import("@stuffbucket/maximal-provider-omlx").Host
      export { gateway } from "anthropic-provider"
    `

    expect(
      findProviderHostImports(source).map(({ specifier }) => specifier),
    ).toEqual([
      "cordis",
      "@stuffbucket/maximal-dsh-host",
      "@stuffbucket/maximal-provider-omlx",
      "anthropic-provider",
    ])
  })

  test("rejects forbidden packages in every dependency field", () => {
    const manifest = {
      dependencies: { cordis: "1.0.0" },
      devDependencies: { "@stuffbucket/maximal-dsh-host": "workspace:*" },
      optionalDependencies: {
        "@stuffbucket/maximal-provider-omlx": "workspace:*",
      },
      peerDependencies: { "anthropic-provider": "1.0.0" },
    }

    expect(
      findProviderHostManifestDependencies(manifest).map(
        ({ specifier }) => specifier,
      ),
    ).toEqual([
      "cordis",
      "@stuffbucket/maximal-dsh-host",
      "@stuffbucket/maximal-provider-omlx",
      "anthropic-provider",
    ])
  })
})
