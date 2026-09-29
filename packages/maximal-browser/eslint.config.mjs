import { typescript } from '@maximal/eslint-config/typescript';

export default [
  ...typescript({
    tsconfigRootDir: import.meta.dirname,
    level: 'recommended',
    typeChecked: true,
  }),
  {
    files: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];
