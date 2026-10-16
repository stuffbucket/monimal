import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { CopyButton } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  globals: { shell: 'design-system' },
  args: {
    text: '~/Library/Logs/stuffbucket',
    about: 'the log folder path',
  },
} satisfies Meta<typeof CopyButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument
    const written: string[] = []
    Object.defineProperty(document.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { written.push(text); return Promise.resolve() } },
    })
    const button = within(canvasElement).getByRole('button', { name: 'Copy the log folder path' })

    await userEvent.click(button)
    await waitFor(() => expect(button).toHaveAccessibleName('Copied the log folder path'))
    await expect(written).toEqual(['~/Library/Logs/stuffbucket'])
  },
}

export const CustomLabel: Story = {
  args: { label: 'Copy report', about: 'the diagnostics report' },
}

export const Disabled: Story = {
  args: { disabled: true },
}
