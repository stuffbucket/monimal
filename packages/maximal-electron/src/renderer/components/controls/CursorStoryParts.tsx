import type { CSSProperties } from 'react';

import { SPATIAL_CANVAS_CURSORS } from '../SpatialCanvasStyles.js';

export const CURSOR_STORY_PAGE_STYLE: CSSProperties = {
  display: 'grid',
  gap: 'var(--shell-space-5)',
};

const introductionStyle: CSSProperties = {
  display: 'grid',
  maxWidth: 'calc(var(--shell-row-height) * 23)',
  gap: 'var(--shell-space-2)',
};

const eyebrowStyle: CSSProperties = {
  color: 'var(--shell-accent)',
  fontSize: 'var(--shell-text-xs)',
  fontWeight: 'var(--shell-weight-lg)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

export const CURSOR_STORY_MUTED_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--shell-text-muted)',
};

export function CursorStoryIntroduction({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: string;
}) {
  return (
    <header style={introductionStyle}>
      <span style={eyebrowStyle}>{eyebrow}</span>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p style={CURSOR_STORY_MUTED_STYLE}>{children}</p>
    </header>
  );
}

const projectBrowserStates = [
  {
    label: 'Select canvas',
    cursor: SPATIAL_CANVAS_CURSORS.select,
    trigger: 'Select tool before dragging',
    result: 'Point at the canvas or clear selection',
  },
  {
    label: 'Pan ready',
    cursor: SPATIAL_CANVAS_CURSORS.pan,
    trigger: 'Hand tool over the canvas',
    result: 'Canvas is ready to drag',
  },
  {
    label: 'Panning',
    cursor: SPATIAL_CANVAS_CURSORS.panning,
    trigger: 'Hand tool while pressed',
    result: 'Canvas viewport is moving',
  },
  {
    label: 'Draw or select a region',
    cursor: SPATIAL_CANVAS_CURSORS.crosshair,
    trigger: 'Marquee drag, shape, section, or connector',
    result: 'Choose an area or world-space path',
  },
  {
    label: 'Edit text',
    cursor: SPATIAL_CANVAS_CURSORS.text,
    trigger: 'Search, sticky note, comment, or chat',
    result: 'Select or enter text',
  },
  {
    label: 'Resize panes',
    cursor: SPATIAL_CANVAS_CURSORS.resizeColumn,
    trigger: 'Left or right pane divider',
    result: 'Change the adjacent pane width',
  },
  {
    label: 'Resize rows',
    cursor: SPATIAL_CANVAS_CURSORS.resizeRow,
    trigger: 'Top or bottom item edge',
    result: 'Change the item height',
  },
  {
    label: 'Resize corners ↘',
    cursor: SPATIAL_CANVAS_CURSORS.resizeNorthwestSoutheast,
    trigger: 'Top-left or bottom-right corner',
    result: 'Change width and height together',
  },
  {
    label: 'Resize corners ↙',
    cursor: SPATIAL_CANVAS_CURSORS.resizeNortheastSouthwest,
    trigger: 'Top-right or bottom-left corner',
    result: 'Change width and height together',
  },
  {
    label: 'Move item',
    cursor: SPATIAL_CANVAS_CURSORS.move,
    trigger: 'Available project or board item',
    result: 'Drag the item on the canvas',
  },
  {
    label: 'Unavailable',
    cursor: SPATIAL_CANVAS_CURSORS.unavailable,
    trigger: 'Missing, restricted, or busy project',
    result: 'The project cannot be opened',
  },
  {
    label: 'Open action',
    cursor: SPATIAL_CANVAS_CURSORS.action,
    trigger: 'Comment pin, search result, or control',
    result: 'Run the indicated action',
  },
] as const;

const stateStyle: CSSProperties = {
  display: 'grid',
  minHeight: 'calc(var(--shell-row-height) * 5)',
  padding: 'var(--shell-space-4)',
  alignContent: 'space-between',
  gap: 'var(--shell-space-3)',
  background: 'var(--shell-raised)',
  border: 'var(--shell-icon-stroke) solid var(--shell-border)',
  borderRadius: 'var(--shell-radius)',
};

export function ProjectBrowserCursorStates() {
  return (
    <div style={CURSOR_STORY_PAGE_STYLE}>
      <CursorStoryIntroduction
        eyebrow="Project browser contract"
        title="Every local pointer state"
      >
        Hover each state to preview the exact system cursor used by the project
        browser. Creation is contextual: drawing and region selection use a
        crosshair, while text creation and editing use an I-beam.
      </CursorStoryIntroduction>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(calc(var(--shell-row-height) * 7), 1fr))',
          gap: 'var(--shell-space-3)',
        }}
      >
        {projectBrowserStates.map((state) => (
          <section
            key={state.label}
            data-project-browser-cursor={state.cursor}
            aria-label={`${state.label}: ${state.cursor} cursor`}
            style={{ ...stateStyle, cursor: state.cursor }}
          >
            <strong>{state.label}</strong>
            <span>{state.trigger}</span>
            <small style={CURSOR_STORY_MUTED_STYLE}>{state.result}</small>
            <code>Hover: {state.cursor}</code>
          </section>
        ))}
      </div>
    </div>
  );
}
