import { typescript } from '@maximal/eslint-config/typescript';

export default [
  ...typescript({
    tsconfigRootDir: import.meta.dirname,
    level: 'recommended',
    typeChecked: true,
  }),
  {
    files: ['tests/**/*.test.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
];
