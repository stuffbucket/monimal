import type { Meta, StoryObj } from '@maximal/maximal-storybook';
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
  type SpatialCanvasCommentEntry,
} from './SpatialCanvasDiscussion.js';

const meta = {
  title: 'Canvas/SpatialCanvas/Discussion',
  component: SpatialCanvasCommentThreadCard,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          'Focused states for creating comments, browsing comment summaries, and reading or replying to an active comment thread.',
      },
    },
  },
} satisfies Meta<typeof SpatialCanvasCommentThreadCard>;

export default meta;
type Story = StoryObj<typeof meta>;

function StoryHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header
      style={{
        position: 'absolute',
        zIndex: 2,
        top: 'calc(var(--shell-space-4) * 2)',
        left: 'calc(var(--shell-space-4) * 2)',
        display: 'grid',
        gap: 'var(--shell-space-1)',
      }}
    >
      <strong>{title}</strong>
      <span style={{ color: 'var(--shell-text-muted)' }}>{description}</span>
    </header>
  );
}

function NewCommentExample() {
  const [value, setValue] = useState('');
  return (
    <SpatialCanvas>
      <StoryHeading
        title="New comment"
        description="An anchored empty pill that expands into the typing composer."
      />
      <SpatialCanvasCommentAnchor x={160} y={120} color="#8b5cf6" />
      <SpatialCanvasCommentComposer
        x={160}
        y={160}
        value={value}
        onChange={setValue}
        onInsertEmoji={() => setValue((current) => `${current}🙂`)}
        onInsertMention={() => setValue((current) => `${current}@`)}
        onSubmit={() => undefined}
        onCancel={() => setValue('')}
        color="#8b5cf6"
      />
    </SpatialCanvas>
  );
}

function CommentSummaryExample() {
  const [resolved, setResolved] = useState(false);
  return (
    <SpatialCanvas>
      <StoryHeading
        title="Comment panel summary"
        description="The compact item used when browsing comments in the side panel."
      />
      <div
        style={{
          position: 'absolute',
          top: '8rem',
          right: 'calc(var(--shell-space-4) * 2)',
          width: '22rem',
        }}
      >
        <SpatialCanvasCommentThread
          initials="MA"
          author="Map agent"
          body="Please review @Taylor"
          timestamp="Just now"
          replyCount={1}
          resolved={resolved}
          selected
          onSelect={() => undefined}
          onToggleResolved={() => setResolved((current) => !current)}
          onDelete={() => undefined}
        />
      </div>
    </SpatialCanvas>
  );
}

const INITIAL_COMMENT: SpatialCanvasCommentEntry = {
  id: 'comment-1',
  initials: 'MA',
  author: 'Map agent',
  body: 'Please review @Taylor',
  timestamp: 'Just now',
  color: '#8b5cf6',
};

const INITIAL_REPLIES: ReadonlyArray<SpatialCanvasCommentEntry> = [{
  id: 'reply-1',
  initials: 'TS',
  author: 'Taylor',
  body: 'On it',
  timestamp: 'Just now',
  color: '#60a5fa',
}];

function ActiveThreadExample({ initiallyResolved = false }) {
  const [reply, setReply] = useState('');
  const [replies, setReplies] = useState(INITIAL_REPLIES);
  const [resolved, setResolved] = useState(initiallyResolved);
  const submitReply = () => {
    if (!reply.trim()) return;
    setReplies((current) => [
      ...current,
      {
        id: `reply-${String(current.length + 1)}`,
        initials: 'MA',
        author: 'Map agent',
        body: reply.trim(),
        timestamp: 'Just now',
      },
    ]);
    setReply('');
  };

  return (
    <SpatialCanvas>
      <StoryHeading
        title={resolved ? 'Resolved comment thread' : 'Active comment thread'}
        description="The root comment, reply history, thread actions, and reply composer."
      />
      <SpatialCanvasCommentThreadCard
        x={160}
        y={140}
        side="right"
        vertical="below"
        comment={INITIAL_COMMENT}
        replies={replies}
        resolved={resolved}
        reply={reply}
        replyInitials="MA"
        onReplyChange={setReply}
        onSubmitReply={submitReply}
        onToggleResolved={() => setResolved((current) => !current)}
        onDelete={() => undefined}
        onClose={() => undefined}
      />
    </SpatialCanvas>
  );
}

export const NewComment: Story = {
  args: {
    x: 0,
    y: 0,
    side: 'right',
    vertical: 'below',
    comment: INITIAL_COMMENT,
    replies: [],
    resolved: false,
    reply: '',
    replyInitials: 'MA',
    onReplyChange: () => undefined,
    onSubmitReply: () => undefined,
    onToggleResolved: () => undefined,
    onDelete: () => undefined,
    onClose: () => undefined,
  },
  render: () => <NewCommentExample />,
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

export const CommentPanelSummary: Story = {
  args: NewComment.args,
  render: () => <CommentSummaryExample />,
};

export const ActiveCommentThread: Story = {
  args: NewComment.args,
  render: () => <ActiveThreadExample />,
};

export const ResolvedCommentThread: Story = {
  args: { ...NewComment.args, resolved: true },
  render: () => <ActiveThreadExample initiallyResolved />,
};
