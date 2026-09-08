import { service } from "@stuffbucket/eslint-config/service"

export default [
  ...service({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ["src/**/*.tsx"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 240, skipBlankLines: true, skipComments: true },
      ],
    },
  },
]
