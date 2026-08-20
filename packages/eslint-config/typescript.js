import tseslint from "typescript-eslint"

import { base } from "./base.js"

/**
 * Files the TypeScript project service is pointed at.
 *
 * Deliberately `.ts`/`.tsx` only. These packages use `.mts` and `.cts` for
 * standalone build and tooling scripts that belong to no tsconfig, and
 * handing such a file to the project service is a hard parse error ("was not
 * found by the project service"), not a lint finding.
 */
export const TYPESCRIPT_FILES = ["**/*.ts", "**/*.tsx"]

/** Everything outside the program, which must not be judged by type-aware rules. */
export const UNTYPED_FILES = [
  "**/*.js",
  "**/*.mjs",
  "**/*.cjs",
  "**/*.mts",
  "**/*.cts",
]

/**
 * TypeScript linting, parameterised by how strict the consumer already is.
 *
 * `level` is a parameter because the two families genuinely differ and both
 * are clean: the service packages run `strictTypeChecked` (69 rules), the
 * Electron app runs `recommended` (21). Collapsing them would either add
 * findings to the app or drop enforcement from the services.
 *
 * `typeChecked` follows `level`. It matters that it stays on for the strict
 * profile: 41 of those rules are type-aware (`await-thenable`,
 * `no-base-to-string`, `no-floating-promises`, `no-deprecated`, ...). Turning
 * it off looks free because the lint still passes -- it passes because those
 * 41 rules stopped running.
 *
 * @param {{
 *   ignores?: Array<string>,
 *   tsconfigRootDir: string,
 *   level?: "recommended" | "strict",
 *   typeChecked?: boolean,
 *   files?: Array<string>,
 *   globals?: Record<string, string>,
 * }} options
 * @returns {Array<import("eslint").Linter.Config>}
 */
export function typescript({
  ignores = [],
  tsconfigRootDir,
  level = "strict",
  typeChecked = level === "strict",
  files = TYPESCRIPT_FILES,
  globals = {},
} = {}) {
  if (typeof tsconfigRootDir !== "string") {
    // Without this the parser falls back to process.cwd(), which is the
    // package directory when run through turbo and the repository root when
    // run by hand -- so the same file resolves to a different tsconfig
    // depending on who invoked the linter. Fail loudly instead.
    throw new TypeError(
      "eslint-config/typescript: pass tsconfigRootDir (use import.meta.dirname)",
    )
  }

  const presetName = typeChecked
    ? level === "strict"
      ? "strictTypeChecked"
      : "recommendedTypeChecked"
    : level

  return [
    ...base({ ignores }),

    ...tseslint.configs[presetName],

    {
      files,
      languageOptions: {
        globals,
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },

    // Type-aware rules are switched back off for files outside the program.
    // Without this they still apply, and every one of them fails with a
    // parser error rather than reporting anything useful.
    ...(typeChecked
      ? [{ files: UNTYPED_FILES, ...tseslint.configs.disableTypeChecked }]
      : []),
  ]
}

export default typescript
