import { service } from "@maximal/eslint-config/service"

export default [
  ...service({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: { "no-console": "off" },
  },
]
