import { useState } from 'react';
import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import {
  EditableLabel,
  type EditableLabelState,
} from './EditableLabel.js';

function Example() {
  const [value, setValue] = useState('quarterly-report.md');
  const [state, setState] = useState<EditableLabelState>('inactive');

  return (
    <div style={{ width: 240 }}>
      <EditableLabel
        value={value}
        state={state}
        onActivate={() => setState('active')}
        onStateChange={setState}
        onCommit={setValue}
        ariaLabel="Document name"
        focusable
      />
      <p>State: {state}</p>
    </div>
  );
}

const meta = {
  title: 'Controls/EditableLabel',
  component: EditableLabel,
  args: {
    value: 'quarterly-report.md',
    state: 'inactive',
    onActivate: () => undefined,
    onStateChange: () => undefined,
    onCommit: () => undefined,
  },
  render: () => <Example />,
} satisfies Meta<typeof EditableLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionModel: Story = {};
