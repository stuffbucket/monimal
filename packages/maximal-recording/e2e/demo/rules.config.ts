import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/rules.demo.ts',
  reporter: [['list']],
});
