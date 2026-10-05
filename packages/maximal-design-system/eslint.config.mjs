import { base } from '@maximal/eslint-config/base';

export default [
  ...base(),
  {
    ignores: ['.agents/**/.venv/**'],
  },
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
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
];
