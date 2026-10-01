import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  SpatialCanvas,
  SpatialCanvasViewport,
} from './SpatialCanvas.js';
import { SpatialCanvasSurface } from './SpatialCanvasSurface.js';

const meta = {
  title: 'Canvas/SpatialCanvasSurface',
  component: SpatialCanvasSurface,
} satisfies Meta<typeof SpatialCanvasSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullWindow: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    title: 'Project map',
    description: 'An edge-to-edge spatial control surface.',
    children: (
      <SpatialCanvas>
        <SpatialCanvasViewport
          tool="select"
          role="tabpanel"
          aria-label="Project map canvas"
        />
      </SpatialCanvas>
    ),
  },
};
