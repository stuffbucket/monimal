import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import {
  SpatialCanvas,
  SpatialCanvasCursor,
  SpatialCanvasScene,
  SpatialCanvasViewport,
} from './SpatialCanvas.js';
import { SpatialCanvasCursorGlyph } from './SpatialCanvasCursorGlyph.js';
import { CursorInteractionStates } from '../controls/CursorInteractionStates.js';
import { CollaborationCursorStates } from '../controls/CursorCollaborationStates.js';
import {
  CURSOR_STORY_MUTED_STYLE,
  CURSOR_STORY_PAGE_STYLE,
  CursorStoryIntroduction,
  ProjectBrowserCursorStates,
} from '../controls/CursorStoryParts.js';

const meta = {
  title: 'Controls/Cursor',
  component: SpatialCanvasCursor,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          'The project browser uses local system cursors for interaction feedback, custom pointer-attached cursors for collaboration modes, and colored presence cursors to show where another person or agent is working.',
      },
    },
  },
} satisfies Meta<typeof SpatialCanvasCursor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionStates: Story = {
  args: {
    x: 0,
    y: 0,
    color: '#ec4899',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Move the local system pointer over each tile. Its shape changes to preview the feedback used by that project-browser action.',
      },
    },
  },
  render: () => <CursorInteractionStates />,
};

export const ProjectBrowserStates: Story = {
  args: {
    x: 0,
    y: 0,
    color: '#ec4899',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The complete local cursor contract used by project-browser canvas tools, project cards, disabled projects, pins, search results, and controls.',
      },
    },
  },
  render: () => <ProjectBrowserCursorStates />,
};

export const CommentingAndCursorChat: Story = {
  args: {
    x: 0,
    y: 0,
    color: '#ec4899',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Figma-inspired collaboration cursors adapted to Maximal tokens: a persistent comment-placement pin and a slash-activated ephemeral cursor-chat bubble.',
      },
    },
  },
  render: () => <CollaborationCursorStates />,
};

function MultiplayerSample({
  labeled,
}: {
  labeled: boolean;
}) {
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <strong>{labeled ? 'Identified participant' : 'Anonymous pointer'}</strong>
      <p style={CURSOR_STORY_MUTED_STYLE}>
        {labeled
          ? 'Pointer and name shown for live multiplayer presence.'
          : 'Pointer shape only, with the identity label hidden.'}
      </p>
      <SpatialCanvas>
        <SpatialCanvasViewport
          id={`isolated-cursor-${labeled ? 'labeled' : 'anonymous'}`}
          camera={{ x: 120, y: 96, zoom: 1 }}
          tool="select"
          role="img"
          aria-label={labeled
            ? 'Presence cursor with participant name'
            : 'Presence cursor without participant name'}
        >
          <SpatialCanvasScene x={120} y={96} zoom={1}>
            {labeled ? (
              <SpatialCanvasCursor x={0} y={0} color="#ec4899">
                Yav
              </SpatialCanvasCursor>
            ) : (
              <span style={{ color: '#ec4899' }}>
                <SpatialCanvasCursorGlyph state="select" />
              </span>
            )}
          </SpatialCanvasScene>
        </SpatialCanvasViewport>
      </SpatialCanvas>
    </section>
  );
}

export const Multiplayer: Story = {
  args: {
    x: 0,
    y: 0,
    color: '#ec4899',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Compares the two presence-cursor renderings: a pointer with no identity label and a multiplayer pointer that identifies its participant.',
      },
    },
  },
  render: () => (
    <div style={CURSOR_STORY_PAGE_STYLE}>
      <CursorStoryIntroduction eyebrow="Remote presence" title="Pointer versus participant">
        Multiplayer always uses the caret and adds the participant name. A
        remote participant&apos;s current interaction state does not replace
        that caret.
      </CursorStoryIntroduction>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
          gap: 24,
        }}
      >
        <MultiplayerSample labeled={false} />
        <MultiplayerSample labeled />
      </div>
    </div>
  ),
};

const presenceLegend = [
  { color: '#ec4899', label: 'You', usage: 'Selecting — caret unchanged' },
  { color: '#8b5cf6', label: 'Planning agent', usage: 'Drawing — caret unchanged' },
  { color: '#0d99ff', label: 'Demo harness', usage: 'Editing text — caret unchanged' },
  {
    color: '#16a34a',
    label: 'Alexandra Montgomery',
    usage: 'Resizing — caret unchanged',
  },
  {
    color: '#f59e0b',
    label: 'Reviewer + Pair',
    usage: 'Commenting and panning — caret unchanged',
  },
  { color: '#ef4444', label: 'Blocked agent', usage: 'Unavailable — caret unchanged' },
] as const;

export const PresenceStates: Story = {
  args: {
    x: 0,
    y: 0,
    color: '#ec4899',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates that participant identity, color, and caret stay stable across remote interaction states, including overlapping cursors.',
      },
    },
  },
  render: () => (
    <div style={CURSOR_STORY_PAGE_STYLE}>
      <CursorStoryIntroduction eyebrow="Multiplayer identities" title="Who is working where">
        Each participant keeps the same colored caret and identity while their
        remote interaction state changes. The close pair previews cursor
        overlap.
      </CursorStoryIntroduction>
      <div
        aria-label="Presence cursor legend"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
          gap: 8,
        }}
      >
        {presenceLegend.map((item) => (
          <div
            key={item.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '12px 1fr',
              padding: 12,
              gap: '2px 10px',
              background: 'var(--maximal-color-bg-tertiary)',
              borderRadius: 'var(--shell-radius)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                gridRow: '1 / 3',
                width: 10,
                height: 10,
                marginTop: 4,
                background: item.color,
                borderRadius: '50%',
              }}
            />
            <strong>{item.label}</strong>
            <small style={{ color: 'var(--maximal-color-text-secondary)' }}>{item.usage}</small>
          </div>
        ))}
      </div>
      <SpatialCanvas>
        <SpatialCanvasViewport
          id="presence-cursor-states"
          camera={{ x: 80, y: 80, zoom: 1 }}
          tool="select"
          role="img"
          aria-label="Seven labeled multiplayer cursor scenarios"
        >
          <SpatialCanvasScene x={80} y={80} zoom={1}>
            <SpatialCanvasCursor x={0} y={0} color="#ec4899">
              You
            </SpatialCanvasCursor>
            <SpatialCanvasCursor
              x={400}
              y={24}
              color="#8b5cf6"
              state="crosshair"
            >
              Planning agent
            </SpatialCanvasCursor>
            <SpatialCanvasCursor x={32} y={176} color="#0d99ff" state="text">
              Demo harness
            </SpatialCanvasCursor>
            <SpatialCanvasCursor
              x={400}
              y={176}
              color="#16a34a"
              state="resizeColumn"
            >
              Alexandra Montgomery
            </SpatialCanvasCursor>
            <SpatialCanvasCursor
              x={184}
              y={16}
              color="#f59e0b"
              state="comment"
            >
              Reviewer
            </SpatialCanvasCursor>
            <SpatialCanvasCursor
              x={192}
              y={24}
              color="#ef4444"
              state="panning"
            >
              Pair
            </SpatialCanvasCursor>
            <SpatialCanvasCursor
              x={640}
              y={104}
              color="#ef4444"
              state="unavailable"
            >
              Blocked agent
            </SpatialCanvasCursor>
          </SpatialCanvasScene>
        </SpatialCanvasViewport>
      </SpatialCanvas>
    </div>
  ),
};
