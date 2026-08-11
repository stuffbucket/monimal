import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../controls/Button.js';

import { CopyButton } from './CopyButton.js';
import { SettingsPage, SettingsSection } from './SettingsPage.js';

/**
 * The frame the three tab-hosted surfaces share.
 *
 * Nothing here sets a background, because the same frame renders on the canvas
 * and inside a dialog. That is easiest to see with both stories open.
 */
const meta = {
  title: 'Settings/SettingsPage',
  component: SettingsPage,
  args: {
    title: 'Model cards',
    description: 'What this surface is for, in one sentence.',
    actions: <Button size="sm">Refresh</Button>,
    children: (
      <>
        <SettingsSection title="First section" description="With an explanation.">
          <div className="field">
            <span className="field__label">Label</span>
            <span className="field__value">Value</span>
          </div>
        </SettingsSection>
        <SettingsSection title="Second section">
          <p className="settings__description">Sections stack down the body.</p>
        </SettingsSection>
      </>
    ),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

/** A title and a body, with nothing else claiming the header. */
export const Bare: Story = {
  args: { description: undefined, actions: undefined },
};

/** The button says what happened, next to the thing it happened to. */
export const Copy: StoryObj = {
  name: 'CopyButton',
  render: () => <CopyButton text="http://127.0.0.1:4141" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Copy' });

    await userEvent.click(button);
    // The clipboard itself is the browser's, and a headless run may refuse it.
    // What this asserts is the confirmation, which is the part that is ours.
    await expect(canvas.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  },
};
