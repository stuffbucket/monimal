import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import {
  EditableHeading,
  EditableListItem,
  EditableMenubarItem,
  EditableTab,
} from './EditableLabelMolecules.js';

function EditableExamples(): ReactElement {
  const [heading, setHeading] = useState('Project roadmap');
  const [listItem, setListItem] = useState('First draft');
  const [tab, setTab] = useState('report.md');
  const [menu, setMenu] = useState('Workspace');
  const [active, setActive] = useState('list');

  return (
    <div style={{ display: 'grid', gap: 'var(--shell-space-5)' }}>
      <EditableHeading value={heading} onCommit={setHeading} />
      <ol>
        <EditableListItem
          value={listItem}
          active={active === 'list'}
          onActivate={() => setActive('list')}
          onCommit={setListItem}
        />
      </ol>
      <div role="tablist" aria-label="Documents">
        <EditableTab
          value={tab}
          active={active === 'tab'}
          onActivate={() => setActive('tab')}
          onCommit={setTab}
        />
      </div>
      <div role="menubar" aria-label="Saved menus">
        <EditableMenubarItem
          value={menu}
          active={active === 'menu'}
          onActivate={() => setActive('menu')}
          onCommit={setMenu}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Controls/EditableLabelMolecules',
  component: EditableHeading,
  render: () => <EditableExamples />,
} satisfies Meta<typeof EditableHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CommonHosts: Story = {
  args: {
    value: 'Project roadmap',
    onCommit: () => undefined,
  },
};
