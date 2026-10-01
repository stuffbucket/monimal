import { MessageCircle, MousePointer2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import {
  CURSOR_STORY_MUTED_STYLE,
  CURSOR_STORY_PAGE_STYLE,
  CursorStoryIntroduction,
} from './CursorStoryParts.js';

const previewStyle: CSSProperties = {
  position: 'relative',
  minHeight: 'calc(var(--shell-row-height) * 8)',
  overflow: 'hidden',
  backgroundColor: 'var(--shell-canvas)',
  backgroundImage:
    'radial-gradient(circle, var(--shell-border) var(--shell-icon-stroke), transparent var(--shell-icon-stroke))',
  backgroundSize: 'var(--shell-space-4) var(--shell-space-4)',
  border: 'var(--shell-icon-stroke) solid var(--shell-border)',
  borderRadius: 'var(--shell-radius)',
};

const cursorStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--shell-row-height) * 3)',
  left: 'calc(var(--shell-row-height) * 4)',
  color: 'var(--shell-accent)',
};

function Pointer() {
  return (
    <MousePointer2
      aria-hidden="true"
      fill="currentColor"
      size={16}
      stroke="var(--shell-canvas)"
      strokeWidth="var(--shell-icon-stroke)"
    />
  );
}

function CommentPlacementCursor() {
  return (
    <span role="img" aria-label="Comment placement cursor" style={cursorStyle}>
      <Pointer />
      <span
        style={{
          position: 'absolute',
          top: 'var(--shell-space-3)',
          left: 'var(--shell-space-3)',
          display: 'grid',
          width: 'var(--shell-control-sm)',
          height: 'var(--shell-control-sm)',
          placeItems: 'center',
          color: 'var(--shell-accent-contrast)',
          background: 'var(--shell-accent)',
          border: 'var(--shell-icon-stroke) solid var(--shell-canvas)',
          borderRadius: 'var(--shell-radius-pill)',
          boxShadow: 'var(--shell-elevation, none)',
        }}
      >
        <MessageCircle aria-hidden="true" size={12} />
      </span>
    </span>
  );
}

function CursorChatCursor() {
  return (
    <span
      role="img"
      aria-label="Cursor chat message: Review this edge"
      style={cursorStyle}
    >
      <Pointer />
      <span
        style={{
          position: 'absolute',
          top: 'var(--shell-space-3)',
          left: 'var(--shell-space-4)',
          display: 'flex',
          minHeight: 'var(--shell-control-md)',
          alignItems: 'center',
          paddingInline: 'var(--shell-space-3)',
          color: 'var(--shell-text)',
          background: 'var(--shell-raised)',
          border: 'var(--shell-icon-stroke) solid var(--shell-accent)',
          borderRadius: 'var(--shell-radius-pill)',
          boxShadow: 'var(--shell-elevation, none)',
          fontSize: 'var(--shell-text-sm)',
          fontWeight: 'var(--shell-weight-md)',
          whiteSpace: 'nowrap',
        }}
      >
        Review this edge
      </span>
    </span>
  );
}

export function CollaborationCursorStates() {
  return (
    <div style={CURSOR_STORY_PAGE_STYLE}>
      <CursorStoryIntroduction
        eyebrow="Figma-inspired collaboration"
        title="Comments persist. Cursor chat disappears."
      >
        Both modes attach a tokenized collaboration cue to the pointer, but
        they make different promises. Comments create a durable pin and thread;
        slash opens a lightweight live message that follows the pointer.
      </CursorStoryIntroduction>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(calc(var(--shell-row-height) * 10), 1fr))',
          gap: 'var(--shell-space-4)',
        }}
      >
        <section style={{ display: 'grid', gap: 'var(--shell-space-2)' }}>
          <strong>Place a comment</strong>
          <p style={CURSOR_STORY_MUTED_STYLE}>
            Press C, place the pin, then write a persistent threaded comment.
          </p>
          <div style={previewStyle}>
            <CommentPlacementCursor />
          </div>
        </section>
        <section style={{ display: 'grid', gap: 'var(--shell-space-2)' }}>
          <strong>Cursor chat</strong>
          <p style={CURSOR_STORY_MUTED_STYLE}>
            Press / and type a short live message. It follows the pointer and
            fades after the conversation moment passes.
          </p>
          <div style={previewStyle}>
            <CursorChatCursor />
          </div>
        </section>
      </div>
    </div>
  );
}
