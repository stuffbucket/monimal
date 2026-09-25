import { service } from "@stuffbucket/eslint-config/service"

export default [
  ...service({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ["scripts/*.{mjs,cjs}"],
    languageOptions: {
      globals: {
        URL: "readonly",
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
  },
  {
    files: ["scripts/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { require: "readonly", module: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]
