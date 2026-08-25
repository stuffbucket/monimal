import { typescript } from "@stuffbucket/eslint-config/typescript";
import reactHooks from "eslint-plugin-react-hooks";

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
    // Type-aware rules are off here, deliberately. `tsc --noEmit` runs clean on
    // this package and is the authority on type correctness; switching them on
    // surfaces 38 findings (mostly require-await and unbound-method) in code
    // that should be changed by someone able to run the app. Turning them on is
    // its own change, not a side effect of unpinning TypeScript.
    typeChecked: false,
  }),
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // exhaustive-deps is why react-hooks is here: several dashboard and
      // first-run components subscribe to core-client events in a `useEffect`,
      // where a missing dep is a stale-closure bug rather than a style nit.
      ...reactHooks.configs["recommended-latest"].rules,
      // Warnings, not errors, and not switched off: each names a real place
      // whose fix is a render-behaviour change that should be made by someone
      // able to run the app. Promote to "error" once cleared.
      //
      //   set-state-in-effect  dashboard/Dashboard.tsx, first-run/useFirstRun.ts,
      //                        workspace/Workspace.tsx -- each seeds state from a
      //                        capability's current() synchronously inside the
      //                        effect that also subscribes to it.
      //   refs                 settings/AccountSection.tsx writes busyRef.current
      //                        during render to keep a guard in sync.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
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
              group: ["**/shared/bridge-channels", "**/shared/bridge-channels.*"],
              message: "IPC channel names are main/preload-only; use window.maximal through a capability adapter.",
            },
          ],
        },
      ],
    },
  },
];
