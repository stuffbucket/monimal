import type { StorybookConfig } from "@storybook/react-vite"

import { storybookManagerHead } from "@maximal/maximal-storybook"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  core: { disableTelemetry: true },
  managerHead: (head) =>
    storybookManagerHead(head, process.env["STORYBOOK_IDENTITY_LABEL"]),
}

export default config
