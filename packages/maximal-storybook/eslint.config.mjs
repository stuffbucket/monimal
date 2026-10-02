import { typescript } from '@maximal/eslint-config/typescript';

export default [
  ...typescript({
    tsconfigRootDir: import.meta.dirname,
    level: 'recommended',
    architectureKind: 'service',
    typeChecked: true,
  }),
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
];
