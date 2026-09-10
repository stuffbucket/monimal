import { typescript } from "@stuffbucket/eslint-config/typescript";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

import shellContract from "./eslint/shell-contract.mjs";

// client/ is a separate npm-managed TypeScript project (see docs/code-style.md).
// It shares the workspace's ignores and typescript-eslint setup, but NOT the
// `/service` profile the two service packages run: that carries a large
// stylistic layer (unicorn, perfectionist, prettier-as-a-rule with `semi:
// false`) tuned to their existing style, and this package is formatted with
// semicolons.
export default [
  ...typescript({
    ignores: ["node_modules/**"],
    tsconfigRootDir: import.meta.dirname,
    level: "recommended",
    architectureKind: "client",
    typeChecked: true,
  }),
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      // Promise-shaped mocks implement the production contract without doing
      // asynchronous work of their own.
      "@typescript-eslint/require-await": "off",
      // Vitest matchers inspect method references without invoking them.
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    // Build scripts run under plain node, outside any tsconfig, so they get
    // node globals and nothing else. Without this every `process` and
    // `console` in them reads as undefined.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/ui-check.mjs"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // exhaustive-deps is why react-hooks is here: renderer components
      // subscribe to core-client events in a `useEffect`,
      // where a missing dep is a stale-closure bug rather than a style nit.
      ...reactHooks.configs["recommended-latest"].rules,
      // Warnings, not errors, and not switched off: each names a real place
      // whose fix is a render-behaviour change that should be made by someone
      // able to run the app. Promote to "error" once cleared.
      //
      //   set-state-in-effect  first-run/useFirstRun.ts seeds state from a
      //                        capability's current() synchronously inside the
      //                        effect that also subscribes to it.
      //   refs                 settings/AccountSection.tsx writes busyRef.current
      //                        during render to keep a guard in sync.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Every `--shell-*` this application writes has to be a name the installed
    // package actually publishes. `theme.test.ts` checks the other direction —
    // that every required variable is defined — and a name invented inside the
    // package's prefix passes that while resolving to nothing. See the header
    // of `eslint/shell-contract.mjs`.
    files: ["src/renderer/**/*.ts", "src/renderer/**/*.tsx"],
    plugins: { "shell-contract": shellContract },
    rules: { "shell-contract/namespace": "error" },
  },
  {
    files: ["src/renderer/**/*.ts", "src/renderer/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@stuffbucket/maximal-core/client",
              message: "The private control connection belongs to Electron main; use a surface capability adapter.",
            },
            {
              name: "@stuffbucket/maximal-core/contract",
              message: "Wire protocol details belong to Electron main, not the product renderer.",
            },
            {
              name: "@stuffbucket/maximal-core/control-contract",
              message: "Control protocol details belong to Electron main, not the product renderer.",
            },
          ],
          patterns: [
            {
              group: [
                "@stuffbucket/*/src",
                "@stuffbucket/*/src/**",
                "stuffbucket-electron/src/**",
              ],
              message: "Import another package through a declared public entry point, never its source tree.",
            },
            {
              group: ["**/shared/bridge-channels", "**/shared/bridge-channels.*"],
              message: "IPC channel names are main/preload-only; use window.maximal through a capability adapter.",
            },
          ],
        },
      ],
    },
  },
];
