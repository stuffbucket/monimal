import { restrictedImportPatterns } from '@maximal/eslint-config/architecture';
import { typescript } from '@maximal/eslint-config/typescript';

export default [
  ...typescript({
    tsconfigRootDir: import.meta.dirname,
    level: 'recommended',
    architectureKind: 'terminal',
    typeChecked: true,
  }),
  {
    files: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    rules: {
      // Promise-shaped fakes implement asynchronous production contracts.
      '@typescript-eslint/require-await': 'off',
      // Vitest receives methods as values for assertions rather than invoking them.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
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
    // The renderer entry is bundled for a browser window.
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictedImportPatterns('terminal'),
            { group: ['node:*'], message: 'Renderer code runs in a browser window.' },
            { group: ['../host/**', '../tmux/**', '../launch/**', '../pty/**'], message: 'Renderer code must not import Node terminal implementation.' },
          ],
        },
      ],
    },
  },
];
