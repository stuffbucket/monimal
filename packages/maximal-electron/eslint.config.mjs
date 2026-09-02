import { typescript } from '@stuffbucket/eslint-config/typescript';

import shell from './eslint/shell.mjs';

export default [
  // No `ignores` argument: this package's generated trees (out, .vite, dist,
  // test-results, playwright-report, storybook-static) are all in the shared
  // list.
  //
  // `level: 'recommended'` is where this package differs from the two service
  // packages, which run `strict`. This app is clean under `recommended`;
  // raising it is a refactor of the app, not a config change.
  ...typescript({
    tsconfigRootDir: import.meta.dirname,
    level: 'recommended',
  }),
  {
    // Build and tooling scripts run in Node, outside the TypeScript program,
    // and so does the flat config's own plugin.
    files: ['scripts/**/*.mjs', 'eslint/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Runs browser code inside `page.evaluate`, so it needs both sets.
    files: ['scripts/storybook-check.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    // `.tsx` was missing here, so none of these rules had ever applied to a
    // renderer component.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      // parserOptions (projectService + tsconfigRootDir) comes from the
      // shared typescript profile; only the build-time constants Vite injects
      // are specific to this package.
      globals: {
        MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        MAIN_WINDOW_VITE_NAME: 'readonly',
        DEMO_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        DEMO_WINDOW_VITE_NAME: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    /*
     * A carried stylesheet is held to the published contract as it is typed.
     *
     * The rules a component draws itself with live in a template literal, so
     * `tsc` sees a string and no CSS tooling ever reads the file. That is how
     * a whole namespace came to be invented — thirty tokens read by nothing,
     * twenty of them second names for values already published, and five
     * exported surfaces that would have reached a consumer with no border and
     * no background at all. Every check ran green over it, because each one
     * reads `structural.css` and the rules had moved out from under it.
     *
     * `scripts/component-css.mjs` is the judgement;
     * `tests/component-styles.test.ts` runs the same call over every carried
     * string at once. This is the same finding delivered where it is cheap.
     *
     * Stories are exempt, and the exemption is the point rather than a
     * loophole: `Tile.stories.tsx` writes the two rules a *host* writes to
     * give a status a colour, in the host's own namespace. A story
     * demonstrating what a consumer supplies is the one place these rules do
     * not apply.
     */
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.stories.tsx'],
    plugins: { shell },
    rules: { 'shell/design-tokens': 'error' },
  },
  {
    /*
     * A published surface takes its words from the caller.
     *
     * These five carried fifty-seven user-facing strings, which fixes the
     * language and the product's voice for everyone who installs the package
     * and puts the thing a consumer is most certain to want to change in the
     * one place they cannot reach. `src/renderer/lib/content.ts` holds them
     * now.
     *
     * Scoped to the settings surfaces rather than the whole renderer, and the
     * scope is the honest part: `src/renderer/components/` also holds this
     * application's own chrome, which is a consumer of the package and is
     * allowed its own copy. Widening this is the work of publishing those,
     * not a lint setting.
     *
     * `tests/content-seam.test.ts` is the stronger half — it renders each
     * surface from the lorem stub and fails on English that reaches the DOM —
     * and it cannot see the two dialogs, because Radix portals them and the
     * test environment has no document. This reads source, so it sees all of
     * them, and it sees them as they are typed.
     */
    files: ['src/renderer/components/settings/**/*.tsx'],
    ignores: ['**/*.stories.tsx'],
    plugins: { shell },
    rules: { 'shell/content': 'error' },
  },
  {
    /*
     * The product may not import from the test tree.
     *
     * `e2e/fixtures/demo-shell` is a capture fixture that imports the product's
     * components, and that direction is the only one that is allowed. Nothing
     * enforced it before, and a single import the other way would put the
     * fixture back in the bundle this change takes it out of.
     */
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/e2e/**'],
              message:
                'src must not import from e2e. The fixture depends on the product, never the reverse.',
            },
          ],
        },
      ],
    },
  },
  {
    /*
     * An application under test closes through `closeApp`.
     *
     * `app.close()` on its own hides a whole class of fault. The process can
     * abort during teardown and Playwright still reports every test as passed,
     * because the assertions already ran. That happened here: the embedded
     * model crashed on quit through four consecutive green runs, and the only
     * evidence was in the operating system's crash reports.
     *
     * `closeApp` in `e2e/harness.ts` reads the exit code and the signal, and
     * throws on either. It was written for that incident and then not used by
     * the stills configuration, which kept the hole open in the one place
     * nobody watches.
     */
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/harness.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name="close"][callee.object.name=/^(app|electronApp)$/]',
          message:
            'Close the application with closeApp from e2e/harness.ts. app.close() reports a crash during teardown as a pass.',
        },
        {
          selector:
            'CallExpression[callee.property.name="close"][callee.object.property.name="app"]',
          message:
            'Close the application with closeApp from e2e/harness.ts. app.close() reports a crash during teardown as a pass.',
        },
      ],
    },
  },
];
