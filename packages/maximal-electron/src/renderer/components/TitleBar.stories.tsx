import { Command, PanelTop } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { IconButton } from './controls/Button.js';
import { getTabPanelId, getTabTriggerId } from './TabBar.js';
import { TitleBar } from './TitleBar.js';

const initialTabs = [
  { id: 'workspace', title: 'Workspace' },
  { id: 'settings', title: 'Settings' },
];

function TitleBarStory({
  editable,
  injectedActions,
}: {
  editable: boolean;
  injectedActions: boolean;
}) {
  const [tabs, setTabs] = useState(initialTabs);
  const [active, setActive] = useState('workspace');
  const tabIdBase = 'titlebar-story';
  const activeTitle = tabs.find((tab) => tab.id === active)?.title;

  return (
    <div>
      <TitleBar
        tabIdBase={tabIdBase}
        leading={
          <IconButton label="Open workspace switcher">
            <PanelTop size={15} />
          </IconButton>
        }
        actions={
          injectedActions ? (
            <IconButton label="Open command palette">
              <Command size={15} />
            </IconButton>
          ) : undefined
        }
        tabs={tabs}
        activeTab={active}
        onSelectTab={setActive}
        onCloseTab={
          editable
            ? (id) => setTabs((current) => current.filter((tab) => tab.id !== id))
            : undefined
        }
        onNewTab={
          editable
            ? () =>
                setTabs((current) => [
                  ...current,
                  { id: `tab-${String(current.length + 1)}`, title: 'New tab' },
                ])
            : undefined
        }
        tabsLabel="Workspace tabs"
        newTabLabel="Create workspace tab"
      />
      <div
        role="tabpanel"
        id={getTabPanelId(tabIdBase, active)}
        aria-labelledby={getTabTriggerId(tabIdBase, active)}
        tabIndex={0}
      >
        {activeTitle} content
      </div>
    </div>
  );
}

const meta = {
  title: 'Layout/TitleBar',
  component: TitleBarStory,
  args: { editable: true, injectedActions: true },
  argTypes: {
    editable: { control: 'boolean' },
    injectedActions: { control: 'boolean' },
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TitleBarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Caller-owned controls and consumer panels retain the complete tabs contract. */
export const InjectedActions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const workspace = canvas.getByRole('tab', { name: 'Workspace' });
    const settings = canvas.getByRole('tab', { name: 'Settings' });

    await userEvent.click(workspace);
    await userEvent.keyboard('{ArrowRight}');
    await expect(settings).toHaveFocus();
    await expect(settings).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{Enter}');
    await expect(settings).toHaveAttribute('aria-selected', 'true');
    const panel = canvas.getByRole('tabpanel');
    await expect(settings).toHaveAttribute('aria-controls', panel.id);
    await expect(panel).toHaveAttribute('aria-labelledby', settings.id);
    await expect(panel).toHaveTextContent('Settings content');
  },
};

/** Tabs can be selection-only, with no misleading create or close controls. */
export const SelectionOnly: Story = {
  args: { editable: false, injectedActions: false },
};
