import deMorgan from "eslint-plugin-de-morgan"
import packageJson from "eslint-plugin-package-json"
import perfectionist from "eslint-plugin-perfectionist"
import prettierRecommended from "eslint-plugin-prettier/recommended"
import regexp from "eslint-plugin-regexp"
import unicorn from "eslint-plugin-unicorn"
import unusedImports from "eslint-plugin-unused-imports"
import globals from "globals"

import { typescript, TYPESCRIPT_FILES } from "./typescript.js"

/**
 * Core-rule opinions that `js.configs.recommended` does not carry.
 *
 * The numbers are load-bearing, not tidy: `complexity: 16` and
 * `max-lines: 800` are what the existing source already satisfies. Rounding
 * either one down is a refactor of both packages, not a config edit.
 *
 * Option objects are spelled out even where they restate a default, so that a
 * plugin changing its defaults shows up as a diff here rather than as a
 * change in what is enforced.
 */
export const CORE_OPINIONS = {
  "accessor-pairs": ["error", {
    enforceForClassMembers: true,
    enforceForTSTypes: false,
    getWithoutSet: false,
    setWithoutGet: true,
  }],
  "array-callback-return": ["error", {
    allowImplicit: false,
    allowVoid: false,
    checkForEach: false,
  }],
  complexity: ["error", { max: 16 }],
  "default-case": ["error", {}],
  "default-case-last": "error",
  "default-param-last": "error",
  eqeqeq: "error",
  "guard-for-in": "error",
  "max-depth": "error",
  "max-lines": ["error", { max: 800, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": ["error", {
    max: 100,
    skipBlankLines: true,
    skipComments: true,
  }],
  "max-nested-callbacks": ["error", { max: 5 }],
  "max-params": "error",
  "no-constructor-return": "error",
  "no-implicit-coercion": ["error", {
    allow: [],
    boolean: true,
    disallowTemplateShorthand: false,
    number: true,
    string: true,
  }],
  "no-lonely-if": "error",
  "no-nested-ternary": "error",
  "no-param-reassign": "error",
  "no-useless-assignment": "error",
  "no-var": "error",
  "prefer-const": ["error", {
    destructuring: "any",
    ignoreReadBeforeAssign: false,
  }],
  "prefer-regex-literals": ["error", { disallowRedundantWrapping: false }],
  "prefer-rest-params": "error",
  "prefer-spread": "error",
  "require-atomic-updates": ["error", { allowProperties: false }],
  yoda: ["error", "never", { exceptRange: false, onlyEquality: false }],
}

/**
 * typescript-eslint rules tuned away from their defaults.
 *
 * `no-unused-vars` is not here: the `^_` convention is workspace-wide and is
 * defined in `./typescript`, which this profile builds on.
 */
export const TYPESCRIPT_RULES = {
  "@typescript-eslint/array-type": ["error", { default: "generic" }],
  "@typescript-eslint/no-confusing-void-expression": [
    "error",
    { ignoreArrowShorthand: true },
  ],
  "@typescript-eslint/no-misused-promises": [
    "error",
    { checksVoidReturn: false },
  ],
  "@typescript-eslint/no-unnecessary-condition": [
    "error",
    { allowConstantLoopConditions: true },
  ],
  "@typescript-eslint/restrict-template-expressions": [
    "error",
    { allowNumber: true },
  ],
}

/**
 * perfectionist, limited to import and export ordering.
 *
 * The plugin's `recommended-*` presets add roughly twenty sort rules,
 * including object-key and union-member sorting, which reorder declarations
 * throughout both packages. These four touch imports and exports only.
 */
export const PERFECTIONIST_RULES = {
  "perfectionist/sort-array-includes": "error",
  "perfectionist/sort-exports": "error",
  "perfectionist/sort-imports": "error",
  "perfectionist/sort-named-exports": "error",
}

/**
 * unicorn, enumerated rather than taken from `unicorn.configs.recommended`.
 *
 * The plugin's recommended set is far larger than this and grows with every
 * major; adopting it wholesale is a few thousand findings across files nobody
 * touched. Listing the rules pins the enforced SET while leaving the plugin
 * version free to float, which makes taking more of unicorn a deliberate
 * change rather than a side effect of an upgrade.
 *
 * A rule that leaves the plugin must be deleted from this list -- naming one
 * that no longer exists is a hard error, not a no-op.
 */
export const UNICORN_RULES = Object.fromEntries(
  [
    "consistent-existence-index-check",
    "consistent-function-scoping",
    "explicit-length-check",
    "no-abusive-eslint-disable",
    "no-accessor-recursion",
    "no-anonymous-default-export",
    "no-array-callback-reference",
    "no-document-cookie",
    "no-for-loop",
    "no-instanceof-builtins",
    "no-invalid-fetch-options",
    "no-invalid-remove-event-listener",
    "no-lonely-if",
    "no-magic-array-flat-depth",
    "no-named-default",
    "no-new-array",
    "no-new-buffer",
    "no-unnecessary-array-flat-depth",
    "no-unnecessary-array-splice-count",
    "no-unnecessary-slice-end",
    "no-unreadable-array-destructuring",
    "no-unreadable-iife",
    "no-unused-properties",
    "no-useless-fallback-in-spread",
    "no-useless-length-check",
    "no-useless-spread",
    "no-useless-switch-case",
    "number-literal-case",
    "prefer-add-event-listener",
    "prefer-array-find",
    "prefer-array-flat",
    "prefer-array-flat-map",
    "prefer-array-index-of",
    "prefer-array-some",
    "prefer-at",
    "prefer-blob-reading-methods",
    "prefer-code-point",
    "prefer-date-now",
    "prefer-dom-node-append",
    "prefer-dom-node-dataset",
    "prefer-dom-node-remove",
    "prefer-dom-node-text-content",
    "prefer-event-target",
    "prefer-export-from",
    "prefer-global-this",
    "prefer-import-meta-properties",
    "prefer-includes",
    "prefer-json-parse-buffer",
    "prefer-keyboard-event-key",
    "prefer-logical-operator-over-ternary",
    "prefer-math-min-max",
    "prefer-math-trunc",
    "prefer-modern-dom-apis",
    "prefer-modern-math-apis",
    "prefer-module",
    "prefer-native-coercion-functions",
    "prefer-negative-index",
    "prefer-node-protocol",
    "prefer-number-properties",
    "prefer-object-from-entries",
    "prefer-optional-catch-binding",
    "prefer-prototype-methods",
    "prefer-query-selector",
    "prefer-reflect-apply",
    "prefer-regexp-test",
    "prefer-set-has",
    "prefer-set-size",
    "prefer-single-call",
    "prefer-string-raw",
    "prefer-string-replace-all",
    "prefer-string-slice",
    "prefer-string-starts-ends-with",
    "prefer-string-trim-start-end",
    "prefer-structured-clone",
    "prefer-switch",
    "prefer-ternary",
    "prefer-type-error",
    "require-array-join-separator",
    "require-number-to-fixed-digits-argument",
    "require-post-message-target-origin",
    "switch-case-braces",
    "text-encoding-identifier-case",
    "throw-new-error",
  ].map((rule) => [`unicorn/${rule}`, "error"]),
)

/** Test files, which the size limits are relaxed for. */
export const TEST_FILES = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
]

/**
 * Scope one config object away from `package.json`.
 *
 * The manifests ARE linted, by the package-json layer, as data; the
 * source-code layers MUST NOT also apply to them. Expressing that as its own
 * `{ ignores: [...] }` entry is a trap -- a config object whose only key is
 * `ignores` is a GLOBAL ignore in flat config, so it stops the manifests
 * being linted at all, and the symptom is a smaller linted-file count rather
 * than any change in findings. Attach the ignore to each object that carries
 * rules instead.
 *
 * @param {import("eslint").Linter.Config} config
 * @returns {import("eslint").Linter.Config}
 */
function exceptPackageJson(config) {
  const keys = Object.keys(config)
  // Leave a pure global-ignores object alone; it is the one shape where
  // adding to `ignores` would change what the whole config array ignores.
  if (keys.length === 1 && keys[0] === "ignores") return config
  return { ...config, ignores: [...(config.ignores ?? []), "**/package.json"] }
}

/**
 * The profile the two service packages (`maximal-core`, `maximal`) run.
 *
 * `prettier` runs as an ESLint rule here because these packages are already
 * formatted that way, and the three non-default options are why: `semi:
 * false` with operators leading the line is a distinctive style that several
 * thousand committed lines are in. Dropping prettier-as-a-rule leaves it
 * unenforced; changing the options reformats every file. The Electron and
 * client packages format differently and deliberately do not use this
 * profile.
 *
 * @param {{
 *   ignores?: Array<string>,
 *   tsconfigRootDir: string,
 *   prettier?: import("prettier").Config,
 * }} options
 * @returns {Array<import("eslint").Linter.Config>}
 */
export function service({ ignores = [], tsconfigRootDir, prettier = {} } = {}) {
  const sourceLayers = [
    ...typescript({
      ignores,
      tsconfigRootDir,
      level: "strict",
      typeChecked: true,
      globals: { ...globals.browser, ...globals.node },
    }),

    { languageOptions: { globals: globals.builtin }, plugins: { unicorn } },
    regexp.configs["flat/recommended"],
    deMorgan.configs.recommended,

    {
      plugins: { perfectionist, "unused-imports": unusedImports },
      rules: {
        ...UNICORN_RULES,
        ...PERFECTIONIST_RULES,
        ...CORE_OPINIONS,
        "unused-imports/no-unused-imports": "error",
      },
    },

    // Scoped to the typed files, unlike the block above. These are type-aware
    // rules, and a config block with no `files` key applies to everything --
    // including this package's own `eslint.config.js`, which is not in any
    // tsconfig. Enabling them there re-enables what `disableTypeChecked`
    // just switched off and fails the whole run with a parser error rather
    // than a finding.
    { files: TYPESCRIPT_FILES, rules: TYPESCRIPT_RULES },

    // `checkNaN` defaults to false in current unicorn, which is weaker than
    // this codebase is held to. Set explicitly so the default cannot move it.
    { rules: { "unicorn/prefer-number-properties": ["error", { checkInfinity: false, checkNaN: true }] } },

    // Tests are allowed to be longer. A table-driven test that covers twelve
    // cases in one function is not the defect `max-lines-per-function` exists
    // to catch, and holding tests to the product limit costs 40 findings here
    // and buys nothing.
    {
      files: TEST_FILES,
      rules: {
        "max-lines-per-function": [
          "error",
          { max: 200, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  ]

  return [
    ...sourceLayers.map(exceptPackageJson),

    // package.json is linted as data, not as source: ordering, duplicate
    // keys, and dependency-range shape.
    packageJson.configs.recommended,
    {
      // Presence checks: each one requires that a field EXIST, and neither
      // says anything about a field that does. Satisfying them means adding
      // `exports` and `sideEffects` to the manifests, which is a packaging
      // decision rather than a lint fix -- `sideEffects: false` tells a
      // bundler it MAY drop an unused import, and if that is untrue the code
      // vanishes from a consumer's build without anything failing.
      files: ["**/package.json"],
      rules: {
        "package-json/require-exports": "off",
        "package-json/require-sideEffects": "off",
      },
    },

    // `prettierRecommended` bundles eslint-config-prettier, which switches
    // off every core and plugin rule that would fight the formatter. It MUST
    // stay last: flat config resolves later entries over earlier ones, so
    // placed any earlier it switches off rules that are then switched back
    // on, and it loses silently. Deliberately NOT scoped away from
    // package.json -- `prettier-plugin-packagejson` sorts the manifests, and
    // this is the layer that applies it.
    prettierRecommended,
    {
      rules: {
        "prettier/prettier": ["error", {
          experimentalOperatorPosition: "start",
          experimentalTernaries: true,
          semi: false,
          plugins: ["prettier-plugin-packagejson"],
          ...prettier,
        }],
      },
    },
  ]
}

export default service
