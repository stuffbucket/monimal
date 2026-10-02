import type { Meta, StoryObj } from '@maximal/maximal-storybook';
import { expect, userEvent, within } from '@maximal/maximal-storybook/test';
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
  viewportId,
  children,
}: {
  title: string;
  description: string;
  viewportId?: string;
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
          id={viewportId}
          tool="select"
          role="region"
          aria-label={`${title} control cluster example`}
        />
      </SpatialCanvas>
    </section>
  );
}

function PageNavigationDemo() {
  const [projectName, setProjectName] = useState('Untitled project');
  const [activePageId, setActivePageId] = useState('projects');
  const [pages, setPages] = useState([
    { id: 'projects', name: 'Page 1' },
    { id: 'planning', name: 'Page 2' },
  ]);
  return (
    <ClusterStage
      title="Corner and page navigation"
      description="Open the page switcher, change pages with pointer or keyboard, or add a page."
      viewportId="control-cluster-page"
    >
      <SpatialCanvasTopBar>
        <SpatialCanvasCorner>
          <SpatialCanvasHeaderAction
            className="spatial-canvas__project-menu-trigger"
            kind="menu"
            label="Maximal menu"
            onClick={() => undefined}
          />
          <SpatialCanvasPages
            projectName={projectName}
            onProjectRename={setProjectName}
            pages={pages}
            activePageId={activePageId}
            panelId="control-cluster-page"
            onPageChange={setActivePageId}
            onPageRename={(pageId, name) =>
              setPages((current) =>
                current.map((page) =>
                  page.id === pageId ? { ...page, name } : page,
                ))}
            onPageMove={(pageId, targetPageId) =>
              setPages((current) => {
                const page = current.find(({ id }) => id === pageId);
                if (!page) return current;
                const withoutPage = current.filter(({ id }) => id !== pageId);
                const targetIndex = withoutPage.findIndex(
                  ({ id }) => id === targetPageId,
                );
                if (targetIndex === -1) return current;
                withoutPage.splice(targetIndex, 0, page);
                return withoutPage;
              })}
            onAddPage={() =>
              setPages((current) => [
                ...current,
                {
                  id: `page-${String(current.length + 1)}`,
                  name: `Page ${String(current.length + 1)}`,
                },
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menu = canvas.getByRole('button', { name: 'Maximal menu' });
    const project = canvas.getByRole('button', { name: 'Untitled project' });
    const pages = canvas.getByRole('button', { name: 'Pages' });
    const pageCount = canvas.getByLabelText('2 pages');

    const menuRect = menu.getBoundingClientRect();
    const projectRect = project.getBoundingClientRect();
    const pagesRect = pages.getBoundingClientRect();
    const pageCountRect = pageCount.getBoundingClientRect();
    const frontPage = pageCount.querySelectorAll('rect')[1];
    const pageCountValue = pageCount.querySelector('text');
    if (!frontPage || !pageCountValue) {
      throw new Error('Missing page-count geometry');
    }
    const frontPageRect = frontPage.getBoundingClientRect();
    const pageCountValueRect = pageCountValue.getBoundingClientRect();
    await expect(menuRect.width, 'menu icon slot width').toBeCloseTo(
      pageCountRect.width,
      0,
    );
    await expect(projectRect.right, 'project precedes page segment')
      .toBeLessThanOrEqual(pagesRect.left);
    await expect(
      Math.abs(
        menuRect.top + menuRect.height / 2
        - (pageCountRect.top + pageCountRect.height / 2),
      ),
      'navigation icon slots share a vertical center',
    ).toBeLessThan(1);
    await expect(
      Math.abs(
        frontPageRect.left + frontPageRect.width / 2
        - (pageCountValueRect.left + pageCountValueRect.width / 2),
      ),
      'page count is horizontally centered in the front sheet',
    ).toBeLessThan(0.5);
    await expect(
      Math.abs(
        frontPageRect.top + frontPageRect.height / 2
        - (pageCountValueRect.top + pageCountValueRect.height / 2),
      ),
      'page count is vertically centered in the front sheet',
    ).toBeLessThan(0.5);

    await userEvent.click(project);
    await expect(project).toHaveAttribute('aria-expanded', 'true');
    await expect(project).toHaveAttribute('data-focused', 'true');
    await userEvent.click(project);
    await expect(canvas.getByRole('textbox', { name: 'Project name' }))
      .toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(pages);
    const addPage = canvas.getByRole('button', { name: 'Add page' });
    for (let index = 0; index < 8; index += 1) {
      await userEvent.click(addPage);
    }
    await expect(canvas.getByLabelText('10 pages')).toHaveTextContent('…');
  },
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
