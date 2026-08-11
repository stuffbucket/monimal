import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook, as the place to look at a control.
 *
 * This repository has three renderer documents and a capture fixture, and none
 * of them is a good place to see a single component in every state. The
 * alternative considered was a bespoke gallery page built as a fourth renderer
 * entry; this is the same idea with a controls panel, a theme toggle, and no
 * code to maintain.
 *
 * It is a developer tool. CI does not build it, for the same reason CI does not
 * capture stills: a tool for looking at things should not gate a pull request.
 * The cost is that a story broken by a refactor rots until someone opens it.
 *
 * Stories sit beside the components they cover. Nothing imports them, so Vite
 * never reaches them from an entry point and they do not reach the bundle.
 * `scripts/verify-package.mjs` asserts that rather than assuming it.
 */
const config: StorybookConfig = {
  stories: ['../src/renderer/**/*.stories.tsx'],
  addons: [
    // A docs page per component, generated from the args and the docstring.
    '@storybook/addon-docs',
    // axe, per story. These primitives exist to get roles, names and focus
    // right, so a check that says when they are not is the point of the tool.
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // No usage data leaves this machine.
  core: { disableTelemetry: true },
  /*
   * The stylesheet mode a run starts in, as a variable rather than only as a
   * toolbar switch. `scripts/storybook-check.mjs` drives the preview by URL
   * and knows nothing about a global, so this is how a whole check runs
   * against the shipped stylesheet: `STORYBOOK_SHELL_MODE=package npm run
   * storybook:check`. See `.storybook/shell-mode.ts`.
   */
  env: (config) => ({
    ...config,
    STORYBOOK_SHELL_MODE: process.env['STORYBOOK_SHELL_MODE'] ?? 'app',
  }),
};

export default config;
