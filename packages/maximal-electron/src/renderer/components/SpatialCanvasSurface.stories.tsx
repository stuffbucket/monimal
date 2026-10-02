import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import {
  SpatialCanvas,
  SpatialCanvasConnectorLayer,
  SpatialCanvasItem,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasViewport,
} from './SpatialCanvas.js';
import { SpatialCanvasSurface } from './SpatialCanvasSurface.js';

const meta = {
  title: 'Canvas/SpatialCanvasSurface',
  component: SpatialCanvasSurface,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          'The windowing boundary around a spatial canvas. Full-window mode fills a dialog; embedded mode fills the layout region provided by its parent.',
      },
    },
  },
} satisfies Meta<typeof SpatialCanvasSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

function SurfaceContents({ mode }: { mode: 'full-window' | 'embedded' }) {
  return (
    <SpatialCanvas>
      <div
        role="note"
        style={{
          position: 'absolute',
          zIndex: 2,
          top: 'calc(var(--shell-space-4) * 2)',
          left: 'calc(var(--shell-space-4) * 2)',
          display: 'grid',
          gap: 'var(--shell-space-1)',
          maxWidth: '24rem',
          padding: 'var(--shell-space-4)',
          color: 'var(--shell-text)',
          background: 'var(--shell-raised)',
          border: '1px solid var(--shell-border)',
          borderRadius: 'var(--shell-radius)',
        }}
      >
        <strong>
          {mode === 'full-window'
            ? 'Full-window surface boundary'
            : 'Embedded surface boundary'}
        </strong>
        <span style={{ color: 'var(--shell-text-muted)' }}>
          {mode === 'full-window'
            ? 'The canvas fills the dialog viewport edge to edge.'
            : 'The canvas fills only this parent layout region.'}
        </span>
      </div>
      <SpatialCanvasViewport
        tool="select"
        role="region"
        aria-label={`${mode} spatial canvas surface example`}
      >
        <SpatialCanvasScene x={160} y={180} zoom={1}>
          <SpatialCanvasConnectorLayer
            lines={[{ id: 'surface-link', x1: 208, y1: 32, x2: 320, y2: 112 }]}
          />
          <SpatialCanvasProjectCard
            x={0}
            y={0}
            width={208}
            height={64}
            selected={false}
            kind="repository"
            title="Project browser"
            description="/workspace/project-browser"
            meta="repository"
            onPointerDown={() => undefined}
            onDoubleClick={() => undefined}
          />
          <SpatialCanvasItem
            kind="sticky"
            label="Canvas content remains inside the surface"
            x={320}
            y={56}
            width={200}
            height={112}
            selected={false}
            connectionMode={false}
            onPointerDown={() => undefined}
          />
        </SpatialCanvasScene>
      </SpatialCanvasViewport>
    </SpatialCanvas>
  );
}

export const FullWindow: Story = {
  name: 'Full-window Dialog',
  args: {
    open: true,
    onOpenChange: () => undefined,
    title: 'Project map',
    description: 'An edge-to-edge spatial control surface.',
    children: <SurfaceContents mode="full-window" />,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the modal windowing mode used when the canvas owns the entire window.',
      },
    },
  },
};

export const Embedded: Story = {
  name: 'Embedded Layout Region',
  args: {
    open: true,
    onOpenChange: () => undefined,
    title: 'Embedded project map',
    description: 'A spatial canvas constrained by its parent layout.',
    embedded: true,
    children: <SurfaceContents mode="embedded" />,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the application-frame mode: the surface participates in its parent flex layout instead of covering the window.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '32rem',
          overflow: 'hidden',
          border: '1px solid var(--shell-border)',
          borderRadius: 'var(--shell-radius)',
        }}
      >
        <Story />
      </div>
    ),
  ],
};
