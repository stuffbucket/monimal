import type { Meta, StoryObj } from '@maximal/maximal-storybook';
import { useState, type ReactNode } from 'react';

import { SpatialCanvas, SpatialCanvasViewport } from './SpatialCanvas.js';
import {
  SpatialCanvasAvatar,
  SpatialCanvasControlGroup,
  SpatialCanvasCorner,
  SpatialCanvasHeaderAction,
  SpatialCanvasPages,
  SpatialCanvasPresence,
  SpatialCanvasToolButton,
  SpatialCanvasTopBar,
  SpatialCanvasZoomControls,
  type SpatialCanvasToolKind,
} from './SpatialCanvasChrome.js';

const meta = {
  title: 'Canvas/SpatialCanvas/Control Clusters',
  component: SpatialCanvasControlGroup,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          'Focused examples of the floating control clusters positioned around a spatial canvas.',
      },
    },
  },
} satisfies Meta<typeof SpatialCanvasControlGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function ClusterStage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: 'grid', gap: 'var(--shell-space-4)' }}>
      <header style={{ display: 'grid', gap: 'var(--shell-space-1)' }}>
        <strong>{title}</strong>
        <span style={{ color: 'var(--shell-text-muted)' }}>{description}</span>
      </header>
      <SpatialCanvas>
        {children}
        <SpatialCanvasViewport
          tool="select"
          role="region"
          aria-label={`${title} control cluster example`}
        />
      </SpatialCanvas>
    </section>
  );
}

function PageNavigationDemo() {
  const [activePageId, setActivePageId] = useState('projects');
  const [pages, setPages] = useState([
    { id: 'projects', name: 'Projects' },
    { id: 'planning', name: 'Planning' },
  ]);
  return (
    <ClusterStage
      title="Corner and page navigation"
      description="Open the page switcher, change pages with pointer or keyboard, or add a page."
    >
      <SpatialCanvasTopBar>
        <SpatialCanvasCorner>
          <SpatialCanvasHeaderAction
            kind="menu"
            label="Maximal menu"
            onClick={() => undefined}
          />
          <SpatialCanvasPages
            pages={pages}
            activePageId={activePageId}
            panelId="control-cluster-page"
            onPageChange={setActivePageId}
            onAddPage={() =>
              setPages((current) => [
                ...current,
                { id: `page-${String(current.length + 1)}`, name: 'Untitled' },
              ])}
          />
        </SpatialCanvasCorner>
        <span />
      </SpatialCanvasTopBar>
    </ClusterStage>
  );
}

function PresenceActionsDemo() {
  const [active, setActive] = useState<'comments' | 'chat'>();
  return (
    <ClusterStage
      title="Presence and collaboration actions"
      description="Participant avatars retain their colors while comments and chat expose active state."
    >
      <SpatialCanvasTopBar>
        <span />
        <SpatialCanvasPresence>
          <SpatialCanvasAvatar
            initials="JD"
            color="var(--shell-accent)"
            title="Jordan · human"
          />
          <SpatialCanvasAvatar
            initials="AG"
            color="var(--shell-warning, var(--shell-text-muted))"
            title="Agent · agent"
          />
          <SpatialCanvasHeaderAction
            kind="comments"
            label="Comments"
            active={active === 'comments'}
            onClick={() => setActive('comments')}
          />
          <SpatialCanvasHeaderAction
            kind="chat"
            label="Chat"
            active={active === 'chat'}
            onClick={() => setActive('chat')}
          />
          <SpatialCanvasHeaderAction
            kind="share"
            label="Share"
            onClick={() => undefined}
          />
        </SpatialCanvasPresence>
      </SpatialCanvasTopBar>
    </ClusterStage>
  );
}

const TOOLS: ReadonlyArray<{
  tool: SpatialCanvasToolKind;
  label: string;
  shortcut: string;
}> = [
  { tool: 'select', label: 'Move', shortcut: 'V' },
  { tool: 'hand', label: 'Hand', shortcut: 'H' },
  { tool: 'sticky', label: 'Sticky note', shortcut: 'S' },
  { tool: 'shape', label: 'Shape', shortcut: 'O' },
  { tool: 'section', label: 'Section', shortcut: 'Shift+S' },
  { tool: 'connector', label: 'Connector', shortcut: 'L' },
  { tool: 'comment', label: 'Comment', shortcut: 'C' },
];

function BoardToolsDemo() {
  const [active, setActive] = useState<SpatialCanvasToolKind>('select');
  return (
    <ClusterStage
      title="Board tools"
      description="Choose a tool to inspect its icon, tooltip, shortcut, and selected treatment."
    >
      <SpatialCanvasControlGroup label="Board tools">
        {TOOLS.map((item) => (
          <SpatialCanvasToolButton
            key={item.tool}
            {...item}
            active={active === item.tool}
            onClick={() => setActive(item.tool)}
          />
        ))}
      </SpatialCanvasControlGroup>
    </ClusterStage>
  );
}

function ZoomDemo() {
  const [zoom, setZoom] = useState(1);
  return (
    <ClusterStage
      title="Zoom controls"
      description="Zoom out, reset to 100%, or zoom in while retaining the compact corner placement."
    >
      <SpatialCanvasZoomControls
        zoom={zoom}
        onZoomOut={() => setZoom((current) => Math.max(0.25, current - 0.25))}
        onReset={() => setZoom(1)}
        onZoomIn={() => setZoom((current) => Math.min(2, current + 0.25))}
      />
    </ClusterStage>
  );
}

export const PageNavigation: Story = {
  args: { label: 'Page navigation', children: null },
  render: () => <PageNavigationDemo />,
};

export const PresenceAndActions: Story = {
  args: { label: 'Presence and actions', children: null },
  render: () => <PresenceActionsDemo />,
};

export const BoardTools: Story = {
  args: { label: 'Board tools', children: null },
  render: () => <BoardToolsDemo />,
};

export const Zoom: Story = {
  args: { label: 'Zoom controls', children: null },
  render: () => <ZoomDemo />,
};
