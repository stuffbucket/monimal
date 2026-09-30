import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  SpatialCanvas,
  SpatialCanvasConnectorLayer,
  SpatialCanvasItem,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasViewport,
} from './SpatialCanvas.js';
import {
  SpatialCanvasControlGroup,
  SpatialCanvasCorner,
  SpatialCanvasHeaderAction,
  SpatialCanvasPages,
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
            onPageChange={() => undefined}
            onAddPage={() => undefined}
          />
        </SpatialCanvasCorner>
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
      <SpatialCanvasViewport tool="select" aria-label="Spatial canvas">
        <SpatialCanvasScene x={240} y={140} zoom={1}>
          <SpatialCanvasConnectorLayer
            lines={[{ id: 'line', x1: 130, y1: 60, x2: 440, y2: 220 }]}
          />
          <SpatialCanvasProjectCard
            x={0}
            y={0}
            width={260}
            height={120}
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
            x={330}
            y={150}
            width={200}
            height={160}
            selected
            onPointerDown={() => undefined}
          />
        </SpatialCanvasScene>
      </SpatialCanvasViewport>
    </SpatialCanvas>
  ),
};
