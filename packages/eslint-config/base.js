import js from "@eslint/js"

/**
 * Generated trees. Every package produces some of these and none wants them
 * linted, so the list lives here rather than drifting apart in four configs.
 *
 * `node_modules` is deliberately absent: flat config ignores it globally
 * unless a config overrides `ignores`, so listing it is a no-op that reads
 * like protection.
 *
 * Entries here are globbed with `**` on both sides because a consumer's
 * outputs can be nested (`packages/maximal/client/out`), and a bare `out/**`
 * anchors to the config file's directory only.
 */
export const generatedTrees = [
  "**/dist/**",
  "**/out/**",
  "**/build/**",
  "**/.vite/**",
  "**/coverage/**",
  "**/reports/**",
  "**/test-results/**",
  "**/playwright-report/**",
  // Storybook's build output: minified vendor code, not this repository's.
  "**/storybook-static/**",
  "**/.turbo/**",
  // Agent worktrees are whole copies of this repository. Linting them reports
  // every finding twice, against files that are not this checkout.
  "**/.claude/**",
]

/**
 * The common denominator: generated-tree ignores plus ESLint's own
 * recommended set, and nothing opinionated.
 *
 * Kept deliberately thin: every package is clean under
 * `js.configs.recommended`, so this much is free to share. The stylistic
 * layer the service packages run is not shared -- hoisting it here would
 * introduce findings in packages that never agreed to it. Opinions live in
 * `./service`.
 *
 * @param {{ ignores?: Array<string> }} [options]
 * @returns {Array<import("eslint").Linter.Config>}
 */
export function base({ ignores = [] } = {}) {
  return [
    { ignores: [...generatedTrees, ...ignores] },
    js.configs.recommended,
  ]
}

export default base
