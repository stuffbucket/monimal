import type { Meta, StoryObj } from '@storybook/react-vite';
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
} satisfies Meta<typeof SpatialCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Board: Story = {
  args: { children: null },
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
  render: () => <AttachedConnectorDemo />,
};
