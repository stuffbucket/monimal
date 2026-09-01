import { service } from "@stuffbucket/eslint-config/service"

export default [
  ...service({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ["src/http.ts", "src/sse.ts", "src/translate.ts", "src/wire.ts"],
    rules: {
      // Protocol state machines and wire serializers branch on every supported
      // frame/field shape; keep the shared limit everywhere else.
      complexity: ["error", { max: 21 }],
    },
  },
  {
    files: ["src/sse.ts"],
    rules: {
      // Incremental line extraction nests inside the reader and decoder loops.
      "max-depth": ["error", { max: 5 }],
    },
  },
  {
    files: ["src/adapter.ts", "tests/**/*.ts"],
    rules: {
      // DSH adapter and node:test interfaces require async implementations even
      // when a particular implementation does not await.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // node:test registers promises at module scope; assertions provide the
      // runtime narrowing that these typed rules cannot model.
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
]
