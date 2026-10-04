import { MessageCircle, MousePointer2 } from 'lucide-react';

import {
  CursorStoryIntroduction,
} from './CursorStoryParts.js';

function Pointer() {
  return (
    <MousePointer2
      aria-hidden="true"
      fill="currentColor"
      size={16}
      stroke="var(--maximal-color-bg-secondary)"
      strokeWidth="var(--shell-icon-stroke)"
    />
  );
}

function CommentPlacementCursor() {
  return (
    <span
      role="img"
      aria-label="Comment placement cursor"
      className="cursor-story__pointer"
    >
      <Pointer />
      <span className="cursor-story__comment-badge">
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
      className="cursor-story__pointer"
    >
      <Pointer />
      <span className="cursor-story__chat">
        Review this edge
      </span>
    </span>
  );
}

export function CollaborationCursorStates() {
  return (
    <div className="cursor-story">
      <CursorStoryIntroduction
        eyebrow="Figma-inspired collaboration"
        title="Comments persist. Cursor chat disappears."
      >
        Both modes attach a tokenized collaboration cue to the pointer, but
        they make different promises. Comments create a durable pin and thread;
        slash opens a lightweight live message that follows the pointer.
      </CursorStoryIntroduction>
      <div className="cursor-story__collaboration-grid">
        <section className="cursor-story__collaboration-section">
          <strong>Place a comment</strong>
          <p className="cursor-story__muted">
            Press C, place the pin, then write a persistent threaded comment.
          </p>
          <div className="cursor-story__preview">
            <CommentPlacementCursor />
          </div>
        </section>
        <section className="cursor-story__collaboration-section">
          <strong>Cursor chat</strong>
          <p className="cursor-story__muted">
            Press / and type a short live message. It follows the pointer and
            fades after the conversation moment passes.
          </p>
          <div className="cursor-story__preview">
            <CursorChatCursor />
          </div>
        </section>
      </div>
    </div>
  );
}
