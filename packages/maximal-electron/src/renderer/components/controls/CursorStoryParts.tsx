import type { CSSProperties } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';
import { SPATIAL_CANVAS_CURSORS } from '../spatialcanvas/SpatialCanvasStyles.js';

const CURSOR_STORY_STYLES = `
.sb-shell .cursor-story {
  display: grid;
  gap: var(--shell-space-5);
}

.sb-shell .cursor-story__introduction {
  display: grid;
  max-width: calc(var(--shell-row-height) * 23);
  gap: var(--shell-space-2);
}

.sb-shell .cursor-story__eyebrow {
  color: var(--maximal-color-text-brand);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-lg);
  letter-spacing: var(--shell-tracking-caps);
  text-transform: uppercase;
}

.sb-shell .cursor-story__title,
.sb-shell .cursor-story__muted {
  margin: 0;
}

.sb-shell .cursor-story__muted {
  color: var(--maximal-color-text-secondary);
}

.sb-shell .cursor-story__state-grid,
.sb-shell .cursor-story__interaction-grid,
.sb-shell .cursor-story__collaboration-grid {
  display: grid;
  gap: var(--shell-space-3);
}

.sb-shell .cursor-story__state-grid,
.sb-shell .cursor-story__interaction-grid {
  grid-template-columns:
    repeat(auto-fit, minmax(calc(var(--shell-row-height) * 7), 1fr));
}

.sb-shell .cursor-story__interaction-grid,
.sb-shell .cursor-story__collaboration-grid {
  gap: var(--shell-space-4);
}

.sb-shell .cursor-story__collaboration-grid {
  grid-template-columns:
    repeat(auto-fit, minmax(calc(var(--shell-row-height) * 10), 1fr));
}

.sb-shell .cursor-story__state,
.sb-shell .cursor-story__sample {
  display: grid;
  min-height: calc(var(--shell-row-height) * 5);
  padding: var(--shell-space-4);
  align-content: space-between;
  gap: var(--shell-space-3);
  background: var(--maximal-color-bg-tertiary);
  border: var(--shell-icon-stroke) solid var(--maximal-color-border-default);
  border-radius: var(--shell-radius);
}

.sb-shell .cursor-story__sample {
  min-height: calc(var(--shell-row-height) * 4);
}

.sb-shell [data-cursor="default"] { cursor: default; }
.sb-shell [data-cursor="grab"] { cursor: grab; }
.sb-shell [data-cursor="grabbing"] { cursor: grabbing; }
.sb-shell [data-cursor="crosshair"] { cursor: crosshair; }
.sb-shell [data-cursor="text"] { cursor: text; }
.sb-shell [data-cursor="col-resize"] { cursor: col-resize; }
.sb-shell [data-cursor="row-resize"] { cursor: row-resize; }
.sb-shell [data-cursor="nwse-resize"] { cursor: nwse-resize; }
.sb-shell [data-cursor="nesw-resize"] { cursor: nesw-resize; }
.sb-shell [data-cursor="move"] { cursor: move; }
.sb-shell [data-cursor="not-allowed"] { cursor: not-allowed; }
.sb-shell [data-cursor="pointer"] { cursor: pointer; }

.sb-shell .cursor-story__collaboration-section {
  display: grid;
  gap: var(--shell-space-2);
}

.sb-shell .cursor-story__preview {
  position: relative;
  min-height: calc(var(--shell-row-height) * 8);
  overflow: hidden;
  background-color: var(--maximal-color-bg-secondary);
  background-image:
    radial-gradient(circle, var(--maximal-color-border-default) var(--shell-icon-stroke), transparent var(--shell-icon-stroke));
  background-size: var(--shell-space-4) var(--shell-space-4);
  border: var(--shell-icon-stroke) solid var(--maximal-color-border-default);
  border-radius: var(--shell-radius);
}

.sb-shell .cursor-story__pointer {
  position: absolute;
  top: calc(var(--shell-row-height) * 3);
  left: calc(var(--shell-row-height) * 4);
  color: var(--maximal-color-text-brand);
}

.sb-shell .cursor-story__comment-badge {
  position: absolute;
  top: var(--shell-space-3);
  left: var(--shell-space-3);
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  place-items: center;
  color: var(--maximal-color-text-onbrand);
  background: var(--maximal-color-bg-brand);
  border: var(--shell-icon-stroke) solid var(--maximal-color-bg-secondary);
  border-radius: var(--shell-radius-pill);
  box-shadow: var(--shell-elevation, none);
}

.sb-shell .cursor-story__chat {
  position: absolute;
  top: var(--shell-space-3);
  left: var(--shell-space-4);
  display: flex;
  min-height: var(--shell-control-md);
  align-items: center;
  padding-inline: var(--shell-space-3);
  color: var(--maximal-color-text-default);
  background: var(--maximal-color-bg-tertiary);
  border: var(--shell-icon-stroke) solid var(--maximal-color-border-brand);
  border-radius: var(--shell-radius-pill);
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
  white-space: nowrap;
}
`;

export const CURSOR_STORY_PAGE_STYLE: CSSProperties = {
  display: 'grid',
  gap: 'var(--shell-space-5)',
};

export const CURSOR_STORY_MUTED_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--maximal-color-text-secondary)',
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
  useComponentStyles('cursor-story', CURSOR_STORY_STYLES);
  return (
    <header className="cursor-story__introduction">
      <span className="cursor-story__eyebrow">{eyebrow}</span>
      <h2 className="cursor-story__title">{title}</h2>
      <p className="cursor-story__muted">{children}</p>
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

export function ProjectBrowserCursorStates() {
  return (
    <div className="cursor-story">
      <CursorStoryIntroduction
        eyebrow="Project browser contract"
        title="Every local pointer state"
      >
        Hover each state to preview the exact system cursor used by the project
        browser. Creation is contextual: drawing and region selection use a
        crosshair, while text creation and editing use an I-beam.
      </CursorStoryIntroduction>
      <div className="cursor-story__state-grid">
        {projectBrowserStates.map((state) => (
          <section
            key={state.label}
            data-project-browser-cursor={state.cursor}
            data-cursor={state.cursor}
            aria-label={`${state.label}: ${state.cursor} cursor`}
            className="cursor-story__state"
          >
            <strong>{state.label}</strong>
            <span>{state.trigger}</span>
            <small className="cursor-story__muted">{state.result}</small>
            <code>Hover: {state.cursor}</code>
          </section>
        ))}
      </div>
    </div>
  );
}
