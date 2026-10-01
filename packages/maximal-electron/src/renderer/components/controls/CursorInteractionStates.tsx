import type { CSSProperties } from 'react';

import { SPATIAL_CANVAS_CURSORS } from '../SpatialCanvasStyles.js';
import {
  CURSOR_STORY_PAGE_STYLE,
  CursorStoryIntroduction,
} from './CursorStoryParts.js';

const interactionStates = [
  {
    label: 'Select',
    cursor: SPATIAL_CANVAS_CURSORS.select,
    usage: 'Select on the canvas',
  },
  { label: 'Pan', cursor: SPATIAL_CANVAS_CURSORS.pan, usage: 'Drag the canvas viewport' },
  {
    label: 'Draw or select a region',
    cursor: SPATIAL_CANVAS_CURSORS.crosshair,
    usage: 'Marquee, shape, section, or connector',
  },
  {
    label: 'Edit text',
    cursor: SPATIAL_CANVAS_CURSORS.text,
    usage: 'Search, sticky note, comment, or chat',
  },
  {
    label: 'Resize panes',
    cursor: SPATIAL_CANVAS_CURSORS.resizeColumn,
    usage: 'Drag the left or right pane divider',
  },
  {
    label: 'Resize rows',
    cursor: SPATIAL_CANVAS_CURSORS.resizeRow,
    usage: 'Drag a top or bottom edge',
  },
  {
    label: 'Resize corners ↘',
    cursor: SPATIAL_CANVAS_CURSORS.resizeNorthwestSoutheast,
    usage: 'Top-left or bottom-right corner',
  },
  {
    label: 'Resize corners ↙',
    cursor: SPATIAL_CANVAS_CURSORS.resizeNortheastSouthwest,
    usage: 'Top-right or bottom-left corner',
  },
  { label: 'Move', cursor: SPATIAL_CANVAS_CURSORS.move, usage: 'Reposition a project' },
  {
    label: 'Unavailable',
    cursor: SPATIAL_CANVAS_CURSORS.unavailable,
    usage: 'Action cannot run',
  },
  { label: 'Open', cursor: SPATIAL_CANVAS_CURSORS.action, usage: 'Open a pin or control' },
] as const;

const sampleStyle: CSSProperties = {
  display: 'grid',
  minHeight: 'calc(var(--shell-row-height) * 4)',
  padding: 'var(--shell-space-4)',
  alignContent: 'space-between',
  gap: 'var(--shell-space-3)',
  background: 'var(--shell-raised)',
  border: 'var(--shell-icon-stroke) solid var(--shell-border)',
  borderRadius: 'var(--shell-radius)',
};

export function CursorInteractionStates() {
  return (
    <div style={CURSOR_STORY_PAGE_STYLE}>
      <CursorStoryIntroduction eyebrow="Local system pointer" title="Hover each action">
        Move your mouse over a tile. The pointer shape communicates what the
        project browser will do before you click or drag.
      </CursorStoryIntroduction>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(calc(var(--shell-row-height) * 7), 1fr))',
          gap: 'var(--shell-space-4)',
        }}
      >
        {interactionStates.map((state) => (
          <div
            key={state.label}
            data-cursor={state.cursor}
            aria-label={`${state.label}: hover to preview the ${state.cursor} cursor`}
            style={{ ...sampleStyle, cursor: state.cursor }}
          >
            <strong>{state.label}</strong>
            <span>{state.usage}</span>
            <code>Hover: {state.cursor}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
