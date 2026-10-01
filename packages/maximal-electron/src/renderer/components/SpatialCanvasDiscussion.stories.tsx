import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import {
  SpatialCanvas,
  SpatialCanvasCommentAnchor,
} from './SpatialCanvas.js';
import {
  SpatialCanvasCommentComposer,
  SpatialCanvasCommentThread,
  SpatialCanvasCommentThreadCard,
} from './SpatialCanvasDiscussion.js';

const meta = {
  title: 'Canvas/SpatialCanvasDiscussion',
  component: SpatialCanvasCommentComposer,
} satisfies Meta<typeof SpatialCanvasCommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function DiscussionExample() {
  const [value, setValue] = useState('');
  return (
    <SpatialCanvas>
      <SpatialCanvasCommentAnchor x={160} y={120} color="#8b5cf6" />
      <SpatialCanvasCommentComposer
        x={160}
        y={120}
        value={value}
        onChange={setValue}
        onInsertEmoji={() => setValue((current) => `${current}🙂`)}
        onInsertMention={() => setValue((current) => `${current}@`)}
        onSubmit={() => undefined}
        onCancel={() => setValue('')}
        color="#8b5cf6"
      />
      <SpatialCanvasCommentThread
        initials="MA"
        author="Map agent"
        body="Please review this path"
        timestamp="Just now"
        replyCount={1}
        resolved={false}
        selected
        onSelect={() => undefined}
        onToggleResolved={() => undefined}
        onDelete={() => undefined}
      />
      <SpatialCanvasCommentThreadCard
        x={520}
        y={120}
        side="left"
        vertical="below"
        comment={{
          id: 'comment-1',
          initials: 'MA',
          author: 'Map agent',
          body: 'Please review @Taylor',
          timestamp: 'Just now',
          color: '#8b5cf6',
        }}
        replies={[{
          id: 'reply-1',
          initials: 'TS',
          author: 'Taylor',
          body: 'On it',
          timestamp: 'Just now',
        }]}
        resolved={false}
        reply=""
        replyInitials="MA"
        onReplyChange={() => undefined}
        onSubmitReply={() => undefined}
        onToggleResolved={() => undefined}
        onDelete={() => undefined}
        onClose={() => undefined}
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
    color: '#8b5cf6',
  },
  render: () => <DiscussionExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const anchor = canvasElement.querySelector<HTMLElement>(
      '.spatial-canvas__comment-anchor',
    );
    const composer = canvas.getByRole('region', { name: 'Add a comment' });
    if (!anchor) throw new Error('Missing anchored comment marker');

    const anchorRect = anchor.getBoundingClientRect();
    const emptyRect = composer.getBoundingClientRect();
    const emptyCenterDelta = Math.abs(
      anchorRect.top + anchorRect.height / 2
      - (emptyRect.top + emptyRect.height / 2),
    );
    await expect(emptyCenterDelta).toBeLessThanOrEqual(0.5);

    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Comment' }),
      'Optically balanced',
    );
    const typingRect = composer.getBoundingClientRect();
    await expect(composer).toHaveAttribute('data-state', 'typing');
    await expect(anchorRect.top - typingRect.top).toBeCloseTo(8, 1);
  },
};
