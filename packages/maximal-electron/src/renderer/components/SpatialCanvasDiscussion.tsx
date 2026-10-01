import { ArrowUp, AtSign, Check, Image, Smile } from "lucide-react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";

import { IconButton } from "./controls/Button.js";
import { Textarea } from "./controls/Fields.js";

/** Renders a compact anchored comment draft. */
export function SpatialCanvasCommentComposer({
  x,
  y,
  value,
  onChange,
  onInsertEmoji,
  onInsertMention,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  value: string;
  onChange: (value: string) => void;
  onInsertEmoji: () => void;
  onInsertMention: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const style: CSSProperties = {
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
  const stopPointer = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <section
      className="spatial-canvas__comment-composer"
      aria-label="Add a comment"
      style={style}
      onPointerDown={stopPointer}
    >
      <Textarea
        aria-label="Comment"
        rows={2}
        value={value}
        placeholder="Add a comment"
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <footer>
        <div role="group" aria-label="Comment tools">
          <IconButton label="Add emoji" onClick={onInsertEmoji}>
            <Smile size={16} />
          </IconButton>
          <IconButton label="Mention someone" onClick={onInsertMention}>
            <AtSign size={16} />
          </IconButton>
          <IconButton label="Attach image" disabled>
            <Image size={16} />
          </IconButton>
        </div>
        <IconButton
          label="Post comment"
          active
          disabled={!value.trim()}
          onClick={onSubmit}
        >
          <ArrowUp size={16} />
        </IconButton>
      </footer>
    </section>
  );
}

/** Renders one compact comment thread summary. */
export function SpatialCanvasCommentThread({
  initials,
  author,
  body,
  resolved,
  selected,
  onSelect,
  onToggleResolved,
}: {
  initials: string;
  author: string;
  body: string;
  resolved: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggleResolved: () => void;
}) {
  return (
    <article
      className="spatial-canvas__comment-thread"
      data-resolved={resolved}
      data-selected={selected}
    >
      <button type="button" onClick={onSelect}>
        <span className="spatial-canvas__comment-author" aria-hidden="true">
          {initials}
        </span>
        <span>
          <span className="spatial-canvas__comment-thread-meta">
            <strong>{author}</strong>
            <small>{resolved ? "Resolved" : "Just now"}</small>
          </span>
          <span>{body}</span>
        </span>
      </button>
      <IconButton
        label={resolved ? "Reopen comment" : "Resolve comment"}
        onClick={onToggleResolved}
      >
        <Check size={14} />
      </IconButton>
    </article>
  );
}

/** Supplies purpose-built header content to a spatial discussion panel. */
export function SpatialCanvasPanelHeader({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="spatial-canvas__panel-header">{children}</div>;
}
