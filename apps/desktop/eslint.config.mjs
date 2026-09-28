import { typescript } from "@maximal/eslint-config/typescript";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

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
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@maximal/maximal-core/client",
            message: "The private control connection belongs to Electron main.",
          },
          {
            name: "@maximal/maximal-core/contract",
            message: "Wire protocol details belong to Electron main.",
          },
          {
            name: "@maximal/maximal-core-contract/control",
            message: "Control protocol details belong to Electron main.",
          },
        ],
        patterns: [{
          group: ["**/shared/bridge-channels", "**/shared/bridge-channels.*"],
          message: "IPC channel names are main/preload-only.",
        }],
      }],
    },
  },
];
