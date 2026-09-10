import { createConfig } from "eslint-plugin-boundaries/config"

const SOURCE_FILES = ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"]

const elements = [
  { type: "renderer", pattern: "src/renderer/**", partialMatch: false },
  { type: "preload", pattern: "src/preload/**", partialMatch: false },
  { type: "main", pattern: "src/main/**", partialMatch: false },
  { type: "host", pattern: "src/host/**", partialMatch: false },
  { type: "shared", pattern: "src/shared/**", partialMatch: false },
  { type: "source", pattern: "src/**", partialMatch: false },
  { type: "test", pattern: "{test,tests,e2e}/**", partialMatch: false },
  { type: "script", pattern: "scripts/**", partialMatch: false },
]

const files = [
  { category: "production", pattern: "src/**" },
  {
    category: "test",
    pattern: [
      "test/**",
      "tests/**",
      "e2e/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/fixtures/**",
    ],
  },
]

const commonRestrictedPatterns = [
  {
    group: ["@stuffbucket/*/src", "@stuffbucket/*/src/**", "stuffbucket-electron/src/**"],
    message: "Import another package through a declared public entry point, never its source tree.",
  },
]

const packageRestrictedPatterns = {
  electron: [
    {
      group: ["maximal-client", "maximal-client/**", "@stuffbucket/maximal-core", "@stuffbucket/maximal-core/**"],
      message: "The reusable Electron package must not depend on consumer or Maximal Core policy.",
    },
  ],
  client: [],
  service: [],
}

/**
 * @param {{ kind?: "electron" | "client" | "service", root: string }} options
 * @returns {Array<import("eslint").Linter.Config>}
 */
export function architecture({ kind = "service", root } = {}) {
  if (typeof root !== "string") {
    throw new TypeError(
      "eslint-config/architecture: pass root (use import.meta.dirname)",
    )
  }

  return [
    createConfig({
      files: SOURCE_FILES,
      settings: {
        "boundaries/root-path": root,
        "boundaries/elements": elements,
        "boundaries/files": files,
      },
      rules: {
        "boundaries/dependencies": [
          "error",
          {
            default: "allow",
            policies: [
              {
                from: { file: { categories: "production" } },
                disallow: { to: { file: { categories: "test" } } },
                message: "Production code must not import tests or fixtures.",
              },
              {
                from: { element: { type: "renderer" } },
                disallow: {
                  to: { element: { types: { anyOf: ["main", "host"] } } },
                },
                message: "Renderer code must not import main or host implementation.",
              },
              {
                from: { element: { type: "shared" } },
                disallow: {
                  to: {
                    element: {
                      types: { anyOf: ["renderer", "preload", "main", "host"] },
                    },
                  },
                },
                message: "Shared contracts must not import process-specific implementation.",
              },
            ],
          },
        ],
      },
    }),
    {
      files: ["src/**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...commonRestrictedPatterns,
              ...packageRestrictedPatterns[kind],
            ],
          },
        ],
      },
    },
  ]
}

export default architecture