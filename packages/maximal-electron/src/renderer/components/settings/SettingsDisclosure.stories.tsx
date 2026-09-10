import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { FormField, TextInput, Textarea } from '../controls/Fields.js';
import { ScrollArea } from '../controls/ScrollArea.js';

import {
  SettingsDisclosure,
  SettingsDisclosureList,
} from './SettingsDisclosure.js';
import { SettingsSection } from './SettingsPage.js';

function ProviderSettings() {
  return (
    <ScrollArea
      style={{ maxHeight: 'calc(var(--shell-control-lg) * 9)', paddingInline: 'var(--shell-space-4)' }}
    >
      <SettingsSection
        title="Provider configuration"
        description="Credentials and request options are retained while a provider is disabled."
      >
        <SettingsDisclosureList>
          <SettingsDisclosure
            title="Ollama hosted search"
            description="Search and fetch through ollama.com using an API key."
            meta="Enabled"
          >
            <FormField label="API key" hint="Provided by the environment until you save an override.">
              {(control) => (
                <TextInput {...control} value="" type="password" onChange={() => undefined} />
              )}
            </FormField>
          </SettingsDisclosure>
          <SettingsDisclosure
            title="Brokered model search"
            description="Broker search through a remotely served model."
            meta="Enabled"
          >
            <FormField label="Model">
              {(control) => (
                <TextInput {...control} value="gpt-5.6-sol" onChange={() => undefined} />
              )}
            </FormField>
          </SettingsDisclosure>
          <SettingsDisclosure
            title="DuckDuckGo fallback"
            description="No-key HTML search with direct HTTPS page fetching."
            meta="Disabled"
          >
            <FormField label="Allowed domains" hint="One domain per line.">
              {(control) => (
                <Textarea {...control} value="" onChange={() => undefined} rows={4} />
              )}
            </FormField>
          </SettingsDisclosure>
        </SettingsDisclosureList>
      </SettingsSection>
    </ScrollArea>
  );
}

const meta = {
  title: 'Settings/SettingsDisclosure',
  component: SettingsDisclosure,
  args: {
    title: 'Ollama hosted search',
    description: 'Search and fetch through ollama.com using an API key.',
    meta: 'Enabled',
    children: <span>Settings</span>,
  },
  render: () => <ProviderSettings />,
} satisfies Meta<typeof SettingsDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProviderList: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ollama = canvas.getByText('Ollama hosted search').closest('summary');
    if (ollama === null) throw new Error('Ollama disclosure summary was not rendered');

    await userEvent.click(ollama);
    const input = canvas.getByLabelText('API key');
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await expect(getComputedStyle(input).boxShadow).not.toBe('none');
    await expect(canvas.getAllByText('Enabled')).toHaveLength(2);
  },
};