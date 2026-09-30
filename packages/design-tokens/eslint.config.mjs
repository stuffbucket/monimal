import { base } from '@maximal/eslint-config/base';

export default [
  ...base(),
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
