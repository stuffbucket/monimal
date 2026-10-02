import type { Meta, StoryObj } from '@maximal/maximal-storybook';
import { expect } from '@maximal/maximal-storybook/test';
import { useRef, useState, type PointerEvent } from 'react';

import {
  SpatialCanvas,
  SpatialCanvasConnectorLayer,
  SpatialCanvasCursor,
  SpatialCanvasItem,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasViewport,
} from './SpatialCanvas.js';
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
} from './SpatialCanvasChrome.js';

const meta = {
  title: 'Canvas/SpatialCanvas',
  component: SpatialCanvas,
  parameters: {
    docs: {
      description: {
        component:
          'Low-level canvas composition and geometry examples. Cursor behavior and multiplayer cursor states are documented separately under Controls/Cursor.',
      },
    },
  },
} satisfies Meta<typeof SpatialCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Board: Story = {
  args: { children: null },
  name: 'Primitive Composition',
  play: async ({ canvasElement }) => {
    const viewport = canvasElement.querySelector('.spatial-canvas__viewport');
    if (viewport === null) throw new Error('Canvas viewport was not rendered');
    const gridElement = viewport.querySelector('.spatial-canvas__grid');
    if (gridElement === null) throw new Error('Canvas grid was not rendered');
    const grid = getComputedStyle(gridElement);
    await expect(grid.backgroundImage).toContain('radial-gradient');
    await expect(grid.backgroundImage).toContain('0.75px');
    await expect(grid.backgroundImage).toContain('1.25px');
    await expect(grid.backgroundPosition).toBe('232px 132px');
    await expect(grid.backgroundSize).toBe('16px 16px');
    await expect(grid.pointerEvents).toBe('none');
    const channels = (value: string) => Array.from(
      value.matchAll(/\d+/g), (match) => Number(match[0]),
    ).slice(0, 3);
    const dots = channels(grid.backgroundImage);
    const background = channels(getComputedStyle(viewport).backgroundColor);
    const opacity = Number(grid.opacity);
    await expect(dots).toHaveLength(3);
    await expect(background).toHaveLength(3);
    await expect(Math.min(...dots.map((channel, index) =>
      Math.abs(channel - (background[index] ?? channel)) * opacity,
    ))).toBeGreaterThan(30);
    if (document.documentElement.dataset['theme'] === 'light') {
      await expect(dots).toEqual([196, 196, 196]);
      await expect(background).toEqual([245, 245, 245]);
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          'A static integration example for canvas chrome, viewport transforms, project cards, items, connectors, and controls. It does not define project-browser behavior.',
      },
    },
  },
  render: () => (
    <SpatialCanvas>
      <SpatialCanvasTopBar>
        <SpatialCanvasCorner>
          <SpatialCanvasHeaderAction
            kind="menu"
            label="Maximal menu"
            onClick={() => undefined}
          />
          <SpatialCanvasPages
            pages={[{ id: 'projects', name: 'Projects' }]}
            activePageId="projects"
            panelId="spatial-story-panel"
            onPageChange={() => undefined}
            onAddPage={() => undefined}
          />
        </SpatialCanvasCorner>
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
            label="Comments (2)"
            onClick={() => undefined}
          />
          <SpatialCanvasHeaderAction
            kind="chat"
            label="Chat"
            onClick={() => undefined}
          />
          <SpatialCanvasHeaderAction
            kind="share"
            label="Share"
            onClick={() => undefined}
          />
        </SpatialCanvasPresence>
      </SpatialCanvasTopBar>
      <SpatialCanvasControlGroup label="Board tools">
        <SpatialCanvasToolButton
          tool="select"
          label="Move"
          shortcut="V"
          active
          onClick={() => undefined}
        />
        <SpatialCanvasToolButton
          tool="sticky"
          label="Sticky note"
          shortcut="S"
          active={false}
          onClick={() => undefined}
        />
      </SpatialCanvasControlGroup>
      <SpatialCanvasZoomControls
        zoom={1}
        onZoomOut={() => undefined}
        onReset={() => undefined}
        onZoomIn={() => undefined}
      />
      <SpatialCanvasViewport
        id="spatial-story-panel"
        camera={{ x: 240, y: 140, zoom: 1 }}
        tool="select"
        role="tabpanel"
        aria-label="Spatial canvas"
      >
        <SpatialCanvasScene x={240} y={140} zoom={1}>
          <SpatialCanvasConnectorLayer
            lines={[{ id: 'line', x1: 208, y1: 32, x2: 300, y2: 184 }]}
          />
          <SpatialCanvasProjectCard
            x={0}
            y={0}
            width={208}
            height={64}
            selected={false}
            kind="repository"
            title="maximal-electron"
            description="/workspace/packages/maximal-electron"
            meta="repository"
            onPointerDown={() => undefined}
            onDoubleClick={() => undefined}
          />
          <SpatialCanvasItem
            kind="sticky"
            label="Shared idea"
            x={300}
            y={128}
            width={160}
            height={112}
            selected
            connectionMode
            onPointerDown={() => undefined}
          />
          <SpatialCanvasCursor
            x={248}
            y={72}
            color="var(--shell-accent)"
          >
            Yav
          </SpatialCanvasCursor>
          <SpatialCanvasCursor
            x={480}
            y={240}
            color="var(--shell-warning, var(--shell-text-muted))"
          >
            Sophie
          </SpatialCanvasCursor>
        </SpatialCanvasScene>
      </SpatialCanvasViewport>
    </SpatialCanvas>
  ),
};

export const BoardLight: Story = {
  ...Board,
  name: 'Camera Grid — Light',
  globals: { theme: 'light' },
  render: () => (
    <SpatialCanvas>
      <SpatialCanvasViewport
        tool="hand"
        camera={{ x: 240, y: 140, zoom: 1 }}
        role="img"
        aria-label="Spatial canvas grid in light theme"
      />
    </SpatialCanvas>
  ),
};

function AttachedConnectorDemo() {
  const [position, setPosition] = useState({ x: 320, y: 100 });
  const drag = useRef<
    { x: number; y: number; originX: number; originY: number } | undefined
  >(undefined);

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === undefined) return;
    setPosition({
      x: drag.current.originX + event.clientX - drag.current.x,
      y: drag.current.originY + event.clientY - drag.current.y,
    });
  };

  return (
    <SpatialCanvas>
      <SpatialCanvasControlGroup label="Board tools">
        <SpatialCanvasToolButton
          tool="select"
          label="Move"
          shortcut="V"
          active
          onClick={() => undefined}
        />
        <SpatialCanvasToolButton
          tool="connector"
          label="Connector"
          shortcut="L"
          active={false}
          onClick={() => undefined}
        />
      </SpatialCanvasControlGroup>
      <SpatialCanvasZoomControls
        zoom={1}
        onZoomOut={() => undefined}
        onReset={() => undefined}
        onZoomIn={() => undefined}
      />
      <SpatialCanvasViewport
        id="connector-demo-panel"
        camera={{ x: 180, y: 150, zoom: 1 }}
        tool="select"
        role="tabpanel"
        aria-label="Attached connector demonstration"
        onPointerMove={moveDrag}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
      >
        <SpatialCanvasScene x={180} y={150} zoom={1}>
          <SpatialCanvasConnectorLayer
            lines={[{
              id: 'responsive-line',
              x1: 208,
              y1: 32,
              x2: position.x,
              y2: position.y + 56,
            }]}
          />
          <SpatialCanvasProjectCard
            x={0}
            y={0}
            width={208}
            height={64}
            selected={false}
            kind="repository"
            title="maximal-electron"
            description="/workspace/packages/maximal-electron"
            meta="repository"
            onPointerDown={() => undefined}
            onDoubleClick={() => undefined}
          />
          <SpatialCanvasItem
            kind="sticky"
            label="Drag me — the connector stays attached"
            x={position.x}
            y={position.y}
            width={160}
            height={112}
            selected
            connectionMode
            onPointerDown={beginDrag}
          />
        </SpatialCanvasScene>
      </SpatialCanvasViewport>
    </SpatialCanvas>
  );
}

export const AttachedConnector: Story = {
  args: { children: null },
  name: 'Attached Connector Interaction',
  parameters: {
    docs: {
      description: {
        story:
          'Drag the sticky note to verify that a connector endpoint remains attached while the item moves.',
      },
    },
  },
  render: () => <AttachedConnectorDemo />,
};
