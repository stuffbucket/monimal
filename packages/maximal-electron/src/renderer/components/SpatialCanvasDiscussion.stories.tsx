import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { SpatialCanvas } from './SpatialCanvas.js';
import {
  SpatialCanvasCommentComposer,
  SpatialCanvasCommentThread,
} from './SpatialCanvasDiscussion.js';

const meta = {
  title: 'Canvas/SpatialCanvasDiscussion',
  component: SpatialCanvasCommentComposer,
} satisfies Meta<typeof SpatialCanvasCommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function DiscussionExample() {
  const [value, setValue] = useState('Please review this path');
  return (
    <SpatialCanvas>
      <SpatialCanvasCommentComposer
        x={160}
        y={120}
        value={value}
        onChange={setValue}
        onInsertEmoji={() => setValue((current) => `${current}🙂`)}
        onInsertMention={() => setValue((current) => `${current}@`)}
        onSubmit={() => undefined}
        onCancel={() => setValue('')}
      />
      <SpatialCanvasCommentThread
        initials="MA"
        author="Map agent"
        body="Please review this path"
        resolved={false}
        selected
        onSelect={() => undefined}
        onToggleResolved={() => undefined}
      />
    </SpatialCanvas>
  );
}

export const ComposerAndThread: Story = {
  args: {
    x: 0,
    y: 0,
    value: '',
    onChange: () => undefined,
    onInsertEmoji: () => undefined,
    onInsertMention: () => undefined,
    onSubmit: () => undefined,
    onCancel: () => undefined,
  },
  render: () => <DiscussionExample />,
};
