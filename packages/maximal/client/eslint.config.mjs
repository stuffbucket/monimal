import babelParser from "@babel/eslint-parser";
import { base } from "@stuffbucket/eslint-config/base";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// client/ is a separate npm-managed TypeScript project (see docs/code-style.md
// and client/package.json). It shares the workspace's generated-tree ignores
// and `js.configs.recommended` through @stuffbucket/eslint-config/base, but
// NOT the `/service` profile the two service packages run: that profile
// carries a large stylistic layer (unicorn, perfectionist import sorting,
// prettier-as-an-eslint-rule with `semi: false`, max-lines and complexity
// caps) tuned to those packages' existing style. This package is formatted
// with semicolons and would be rewritten end to end by it. This config
// targets the specific defect classes worth catching here instead: dead code
// and missing/incorrect React hook dependencies (several components manage
// subscription lifecycles, where a missing dep is a real bug, not a style
// nit).
//
// IMPORTANT — why Babel, not typescript-eslint: client/package.json pins
// `typescript: ^7.0.2`. typescript-eslint refuses to load against TS >= 6.1 —
// every one of its packages throws at import time, unconditionally, even for
// plain (non-type-aware) parsing. Re-checked during the ESLint 10 migration:
// typescript-eslint 8.67.0, the current release, still declares
// `typescript: ">=4.8.4 <6.1.0"`, so nothing has changed upstream. See
// https://github.com/typescript-eslint/typescript-eslint/issues/10940 and
// https://github.com/typescript-eslint/typescript-eslint/issues/12518.
// The only path short of that is a second, aliased TypeScript <6.1 install
// just for the linter (the "side by side" pattern TypeScript's own 7.0
// announcement describes) — a real dependency-story change (a shadow compiler
// whose type layer can disagree with the real `tsc`) and deliberately NOT
// done here without a human sign-off.
//
// So: this config uses `@babel/eslint-parser` to get real syntax parsing for
// `.ts`/`.tsx`, which unlocks react-hooks and core unused-vars checking. What
// it does NOT get us: type-aware rules like `no-floating-promises` or
// `no-unsafe-*` (those need a type checker, which is what is blocked above).
//
// The Babel packages here are 8.x, and that is an ESLint 10 requirement
// rather than a preference: `@babel/eslint-parser` 7.x declares no ESLint 10
// peer (its range stops at ^9.0.0), and the 8.x parser requires
// `@babel/core` ^8, so the parser, core and both presets had to move together.
//
// Deliberately NOT using `eslint-plugin-unused-imports` (which would give
// autofix for dead imports): it borrows `@typescript-eslint/eslint-plugin`'s
// no-unused-vars implementation internally. `client/` is a nested directory
// inside this repo, so that require can resolve PAST client/node_modules to
// the hoisted root copy (on a TypeScript 5.x the version guard above does not
// reject) — and then crashes for a different reason: it feeds Babel's AST
// into a visitor built for typescript-eslint's AST shape. Core
// `no-unused-vars` below has no such cross-boundary dependency.
export default [
  ...base({ ignores: ["node_modules/**"] }),
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts"],
    languageOptions: {
      parser: babelParser,
      sourceType: "module",
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript", "@babel/preset-react"],
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // rules-of-hooks + exhaustive-deps. The latter is the whole reason
      // react-hooks is here: several dashboard/first-run components subscribe
      // to core-client events in a `useEffect`, and a dep left off that list
      // is a real "stale closure" bug class, not a style nit.
      ...reactHooks.configs["recommended-latest"].rules,
      // Warnings, not errors, and not switched off: each names a real place
      // whose fix is a render-behaviour change that should be made by someone
      // able to run the app. Promote to "error" once cleared.
      //
      //   set-state-in-effect  dashboard/Dashboard.tsx, first-run/useFirstRun.ts,
      //                        workspace/Workspace.tsx -- each seeds state from a
      //                        capability's current() synchronously inside the
      //                        effect that also subscribes to it. Seeding from a
      //                        useState initialiser changes when the first value
      //                        is read.
      //   refs                 settings/AccountSection.tsx writes busyRef.current
      //                        during render to keep a guard in sync.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      // TypeScript's own compiler (`tsc --noEmit`, wired into `npm run
      // typecheck`) is the authority on undefined/undeclared identifiers.
      // Core `no-undef` predates TS and does not understand type-only
      // positions (object type literals, ambient globals like
      // `NodeJS.Signals`, etc.); with a Babel-based parser (no TS type
      // layer — see file header) it fires false positives on every property
      // name inside a type literal. Standard practice for TS projects is to
      // disable it in favor of the type checker.
      "no-undef": "off",
      // Also off, for `.tsx` — confirmed by hand (minimal repro) that
      // @babel/eslint-parser's bundled scope analyzer does not register a
      // JSX element's tag name (`<Something />`) as a reference to the
      // identifier it names, at all. That is not a TS-specific edge case:
      // `import { Something } from './x'; ... return <Something />` — the
      // single most ordinary React import pattern there is — is reported as
      // an unused import. Turning this rule on would flag most component
      // files' own component imports. Left for a human alongside the
      // typescript-eslint gap above; both need either TS 7 support upstream
      // or the shadow-6.x-compiler workaround to fix properly.
      "no-unused-vars": "off",
      "prefer-const": "error",
      "no-var": "error",
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
