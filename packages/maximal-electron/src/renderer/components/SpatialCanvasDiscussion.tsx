import {
  ArrowUp,
  AtSign,
  Check,
  Image,
  MoreHorizontal,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";

import { IconButton } from "./controls/Button.js";
import { Textarea } from "./controls/Fields.js";
import { Menu } from "./controls/Overlays.js";

export interface SpatialCanvasCommentEntry {
  id: string;
  initials: string;
  author: string;
  body: string;
  timestamp: string;
  color?: string;
}

function CommentAvatar({
  initials,
  color,
}: {
  initials: string;
  color?: string;
}) {
  return (
    <span
      className="spatial-canvas__comment-author"
      aria-hidden="true"
      style={color ? { borderColor: color } : undefined}
    >
      {initials}
    </span>
  );
}

function CommentBody({ children }: { children: string }) {
  return (
    <span className="spatial-canvas__comment-body">
      {children.split(/(@[\w.-]+)/u).map((part, index) =>
        part.startsWith("@") ?
          <mark key={`${part}-${String(index)}`}>{part}</mark>
        : part,
      )}
    </span>
  );
}

/** Renders an anchored comment draft entry surface. */
export function SpatialCanvasCommentComposer({
  x,
  y,
  value,
  onChange,
  onInsertEmoji,
  onInsertMention,
  onSubmit,
  onCancel,
  color,
}: {
  x: number;
  y: number;
  value: string;
  onChange: (value: string) => void;
  onInsertEmoji: () => void;
  onInsertMention: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  color: string;
}) {
  const state = value.length > 0 ? "typing" : "empty";
  const style: CSSProperties = {
    borderColor: color,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
  const stopPointer = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <section
      className="spatial-canvas__comment-composer"
      aria-label="Add a comment"
      data-state={state}
      style={style}
      onPointerDown={stopPointer}
    >
      <Textarea
        aria-label="Comment"
        rows={state === "empty" ? 1 : 3}
        value={value}
        placeholder="Add a comment"
        autoFocus
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
        {state === "typing" ?
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
        : null}
        <IconButton
          label="Post comment"
          className="spatial-canvas__comment-submit"
          active
          disabled={!value.trim()}
          style={value.trim() ? { backgroundColor: color } : undefined}
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
  timestamp,
  replyCount = 0,
  resolved,
  selected,
  onSelect,
  onToggleResolved,
  onDelete,
}: {
  initials: string;
  author: string;
  body: string;
  timestamp: string;
  replyCount?: number;
  resolved: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className="spatial-canvas__comment-thread"
      data-resolved={resolved}
      data-selected={selected}
    >
      <button type="button" onClick={onSelect}>
        <CommentAvatar initials={initials} />
        <span>
          <span className="spatial-canvas__comment-thread-meta">
            <strong>{author}</strong>
            <small>{resolved ? "Resolved" : timestamp}</small>
          </span>
          <CommentBody>{body}</CommentBody>
          {replyCount > 0 ?
            <small>{`${String(replyCount)} ${replyCount === 1 ? "reply" : "replies"}`}</small>
          : null}
        </span>
      </button>
      <div className="spatial-canvas__comment-thread-actions">
        <Menu
          align="end"
          trigger={
            <IconButton label={`More actions for comment by ${author}`}>
              <MoreHorizontal size={16} />
            </IconButton>
          }
          items={[
            {
              id: "delete-comment",
              label: "Delete comment",
              icon: Trash2,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        />
        <IconButton
          label={resolved ? "Reopen comment" : "Resolve comment"}
          onClick={onToggleResolved}
        >
          <Check size={16} />
        </IconButton>
      </div>
    </article>
  );
}

/** Renders the active on-canvas thread and its reply composer. */
export function SpatialCanvasCommentThreadCard({
  x,
  y,
  side,
  vertical,
  comment,
  replies,
  resolved,
  reply,
  replyInitials,
  onReplyChange,
  onSubmitReply,
  onToggleResolved,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  side: "left" | "right";
  vertical: "above" | "below";
  comment: SpatialCanvasCommentEntry;
  replies: ReadonlyArray<SpatialCanvasCommentEntry>;
  resolved: boolean;
  reply: string;
  replyInitials: string;
  onReplyChange: (value: string) => void;
  onSubmitReply: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const style: CSSProperties = {
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
  const stopPointer = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  const entries = [comment, ...replies];

  return (
    <section
      className="spatial-canvas__comment-card"
      aria-label={`Comment by ${comment.author}`}
      data-resolved={resolved}
      data-side={side}
      data-vertical={vertical}
      style={style}
      onPointerDown={stopPointer}
    >
      <header>
        <strong>Comment</strong>
        <div role="group" aria-label="Thread actions">
          <Menu
            align="end"
            trigger={
              <IconButton label="More comment actions">
                <MoreHorizontal size={16} />
              </IconButton>
            }
            items={[
              {
                id: "delete-comment",
                label: "Delete comment",
                icon: Trash2,
                danger: true,
                onSelect: onDelete,
              },
            ]}
          />
          <IconButton
            label={resolved ? "Reopen comment" : "Resolve comment"}
            onClick={onToggleResolved}
          >
            <Check size={16} />
          </IconButton>
          <IconButton label="Close comment" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </header>
      <div className="spatial-canvas__comment-card-thread">
        {entries.map((entry) => (
          <article key={entry.id}>
            <CommentAvatar initials={entry.initials} color={entry.color} />
            <div>
              <span className="spatial-canvas__comment-thread-meta">
                <strong>{entry.author}</strong>
                <small>{entry.timestamp}</small>
              </span>
              <CommentBody>{entry.body}</CommentBody>
            </div>
          </article>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitReply();
        }}
      >
        <CommentAvatar initials={replyInitials} />
        <Textarea
          aria-label="Reply to comment"
          rows={1}
          value={reply}
          placeholder="Reply"
          disabled={resolved}
          onChange={onReplyChange}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmitReply();
            }
          }}
        />
        <IconButton
          label="Post reply"
          active
          type="button"
          disabled={resolved || !reply.trim()}
          onClick={onSubmitReply}
        >
          <ArrowUp size={16} />
        </IconButton>
      </form>
    </section>
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
