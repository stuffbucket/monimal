import { typescript } from '@stuffbucket/eslint-config/typescript';

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
    // Build and tooling scripts run in Node, outside the TypeScript program.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
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
