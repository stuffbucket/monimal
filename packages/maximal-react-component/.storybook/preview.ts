import type { Preview } from "@storybook/react-vite"

const preview: Preview = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: "landmark-one-main", enabled: false },
          { id: "page-has-heading-one", enabled: false },
          { id: "region", enabled: false },
        ],
      },
    },
    backgrounds: { disable: true },
    controls: { expanded: true },
    layout: "centered",
  },
}

export default preview
