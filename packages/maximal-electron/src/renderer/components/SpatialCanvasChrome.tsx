import {
  Frame,
  Hand,
  LayoutGrid,
  MessageSquare,
  MessagesSquare,
  Minus,
  MousePointer2,
  Plus,
  Shapes,
  Share2,
  StickyNote,
  Workflow,
  X,
} from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Button, IconButton } from "./controls/Button.js";

/** A page exposed by spatial canvas page controls. */
export interface SpatialCanvasPage {
  id: string;
  name: string;
}

export type SpatialCanvasToolKind =
  | "select"
  | "hand"
  | "sticky"
  | "shape"
  | "section"
  | "connector"
  | "comment";

function toolIcon(tool: SpatialCanvasToolKind) {
  const props = { size: 16, strokeWidth: 1.75 };
  if (tool === "select") return <MousePointer2 {...props} />;
  if (tool === "hand") return <Hand {...props} />;
  if (tool === "sticky") return <StickyNote {...props} />;
  if (tool === "shape") return <Shapes {...props} />;
  if (tool === "section") return <Frame {...props} />;
  if (tool === "connector") return <Workflow {...props} />;
  return <MessageSquare {...props} />;
}

/** Renders one compact icon action in the spatial editing toolbar. */
export function SpatialCanvasToolButton({
  tool,
  label,
  shortcut,
  active,
  onClick,
}: {
  tool: SpatialCanvasToolKind;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}) {
  const accessibleLabel = `${label} (${shortcut})`;
  return (
    <IconButton
      label={accessibleLabel}
      tooltip={accessibleLabel}
      active={active}
      onClick={onClick}
    >
      {toolIcon(tool)}
    </IconButton>
  );
}

export type SpatialCanvasHeaderActionKind =
  | "menu"
  | "comments"
  | "chat"
  | "share";

function headerActionIcon(kind: SpatialCanvasHeaderActionKind) {
  const props = { size: 16, strokeWidth: 1.75 };
  if (kind === "menu") return <LayoutGrid {...props} />;
  if (kind === "comments") return <MessageSquare {...props} />;
  if (kind === "chat") return <MessagesSquare {...props} />;
  return <Share2 {...props} />;
}

/** Renders a compact icon action in the spatial canvas header. */
export const SpatialCanvasHeaderAction = forwardRef<
  HTMLButtonElement,
  {
    kind: SpatialCanvasHeaderActionKind;
    label: string;
    active?: boolean;
  } & Omit<ComponentPropsWithoutRef<"button">, "children" | "aria-label">
>(function SpatialCanvasHeaderAction(
  { kind, label, active, ...props },
  ref,
) {
  return (
    <IconButton {...props} ref={ref} label={label} active={active}>
      {headerActionIcon(kind)}
    </IconButton>
  );
});

/** Positions primary spatial canvas actions across the top edge. */
export function SpatialCanvasTopBar({ children }: { children: ReactNode }) {
  return <header className="spatial-canvas__topbar">{children}</header>;
}

/** Groups controls within a spatial canvas corner. */
export function SpatialCanvasCorner({ children }: { children: ReactNode }) {
  return <div className="spatial-canvas__corner">{children}</div>;
}

/** Renders spatial canvas page tabs and page creation. */
export function SpatialCanvasPages({
  pages,
  activePageId,
  onPageChange,
  onAddPage,
}: {
  pages: ReadonlyArray<SpatialCanvasPage>;
  activePageId: string;
  onPageChange: (pageId: string) => void;
  onAddPage: () => void;
}) {
  return (
    <div className="spatial-canvas__pages">
      <div role="tablist" aria-label="Map pages">
        {pages.map((page) => (
          <Button
            size="sm"
            role="tab"
            key={page.id}
            aria-selected={page.id === activePageId}
            onClick={() => onPageChange(page.id)}
          >
            {page.name}
          </Button>
        ))}
      </div>
      <IconButton label="Add page" onClick={onAddPage}>
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

/** Groups participant presence and sharing controls. */
export function SpatialCanvasPresence({ children }: { children: ReactNode }) {
  return (
    <div
      className="spatial-canvas__presence"
      aria-label="People in this project map"
    >
      {children}
    </div>
  );
}

/** Renders a compact participant avatar with a dynamic presence color. */
export function SpatialCanvasAvatar({
  initials,
  color,
  title,
}: {
  initials: string;
  color: string;
  title: string;
}) {
  return (
    <span
      className="spatial-canvas__avatar"
      title={title}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}

/** Positions the primary spatial editing tools. */
export function SpatialCanvasControlGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav className="spatial-canvas__controls" aria-label={label}>
      {children}
    </nav>
  );
}

/** Renders a compact floating inspector over the spatial canvas. */
export function SpatialCanvasFloatingPanel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <aside className="spatial-canvas__floating-panel" aria-label={label}>
      {children}
    </aside>
  );
}

/** Renders a dismissible side panel over the spatial canvas. */
export function SpatialCanvasSidePanel({
  label,
  title,
  onClose,
  children,
  footer,
}: {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside className="spatial-canvas__side-panel" aria-label={label}>
      <header>
        <strong>{title}</strong>
        <IconButton label={`Close ${title}`} onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>
      <div className="spatial-canvas__side-panel-body">{children}</div>
      {footer}
    </aside>
  );
}

/** Renders zoom in, reset, and zoom out controls. */
export function SpatialCanvasZoomControls({
  zoom,
  onZoomOut,
  onReset,
  onZoomIn,
}: {
  zoom: number;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
}) {
  return (
    <div className="spatial-canvas__zoom" aria-label="Zoom controls">
      <IconButton label="Zoom out" onClick={onZoomOut}>
        <Minus size={14} />
      </IconButton>
      <Button size="sm" onClick={onReset}>
        {Math.round(zoom * 100)}%
      </Button>
      <IconButton label="Zoom in" onClick={onZoomIn}>
        <Plus size={14} />
      </IconButton>
    </div>
  );
}
