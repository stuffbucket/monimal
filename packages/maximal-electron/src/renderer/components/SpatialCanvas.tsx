import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { Folder, FolderGit2, MousePointer2 } from "lucide-react";

import { useComponentStyles } from "../lib/component-styles.js";
import { SPATIAL_CANVAS_STYLES } from "./SpatialCanvasStyles.js";

/** A connector segment expressed in spatial canvas coordinates. */
export interface SpatialCanvasLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function ConnectionHandles() {
  return (
    <span className="spatial-canvas__connection-handles" aria-hidden="true">
      <span data-edge="top" />
      <span data-edge="right" />
      <span data-edge="bottom" />
      <span data-edge="left" />
    </span>
  );
}

interface Positioned {
  x: number;
  y: number;
}

interface Sized extends Positioned {
  width: number;
  height: number;
}

function positionStyle({ x, y }: Positioned): CSSProperties {
  return { transform: `translate3d(${x}px, ${y}px, 0)` };
}

function sizedStyle({ x, y, width, height }: Sized): CSSProperties {
  return { ...positionStyle({ x, y }), width, height };
}

/** Provides the token-driven root for a spatial editing surface. */
export function SpatialCanvas({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  useComponentStyles("spatial-canvas", SPATIAL_CANVAS_STYLES);

  return (
    <div className="spatial-canvas" data-testid={testId}>
      {children}
    </div>
  );
}

/** Provides the focusable interaction viewport for a spatial canvas. */
export const SpatialCanvasViewport = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div"> & { tool: string }
>(function SpatialCanvasViewport({ tool, children, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className="spatial-canvas__viewport"
      data-tool={tool}
    >
      {children}
    </div>
  );
});

/** Applies a camera translation and zoom to world-space children. */
export function SpatialCanvasScene({
  x,
  y,
  zoom,
  children,
}: Positioned & { zoom: number; children: ReactNode }) {
  return (
    <div
      className="spatial-canvas__scene"
      style={{ transform: `translate3d(${x}px, ${y}px, 0) scale(${zoom})` }}
    >
      {children}
    </div>
  );
}

/** Renders world-space connector segments without clipping their geometry. */
export function SpatialCanvasConnectorLayer({
  lines,
}: {
  lines: ReadonlyArray<SpatialCanvasLine>;
}) {
  return (
    <svg
      className="spatial-canvas__connectors"
      aria-hidden="true"
      width="1"
      height="1"
    >
      {lines.map((line) => (
        <g key={line.id} data-connector-id={line.id}>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
          <circle cx={line.x1} cy={line.y1} r="3" />
          <circle cx={line.x2} cy={line.y2} r="3" />
        </g>
      ))}
    </svg>
  );
}

/** Renders an interactive project card at world-space bounds. */
export function SpatialCanvasProjectCard({
  x,
  y,
  width,
  height,
  selected,
  connectionMode = false,
  disabled,
  kind,
  title,
  description,
  meta,
  onPointerDown,
  onDoubleClick,
}: Sized & {
  selected: boolean;
  connectionMode?: boolean;
  disabled?: boolean;
  kind: string;
  title: string;
  description: string;
  meta?: string;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onDoubleClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="spatial-canvas__node spatial-canvas__project"
      data-selected={selected}
      data-connecting={connectionMode}
      disabled={disabled}
      style={sizedStyle({ x, y, width, height })}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <span className="spatial-canvas__project-icon" aria-hidden="true">
        {kind === "repository" ?
          <FolderGit2 size={16} />
        : <Folder size={16} />}
      </span>
      <span className="spatial-canvas__project-copy">
        <span className="spatial-canvas__project-title">{title}</span>
        <span className="spatial-canvas__project-path">{description}</span>
        {meta ?
          <span className="spatial-canvas__project-meta">{meta}</span>
        : null}
      </span>
      {connectionMode ? <ConnectionHandles /> : null}
    </button>
  );
}

/** Renders a sticky, shape, or section at world-space bounds. */
export function SpatialCanvasItem({
  kind,
  label,
  selected,
  connectionMode = false,
  onPointerDown,
  ...bounds
}: Sized & {
  kind: "sticky" | "shape" | "section";
  label: string;
  selected: boolean;
  connectionMode?: boolean;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${kind}: ${label}`}
      className="spatial-canvas__node spatial-canvas__item"
      data-kind={kind}
      data-selected={selected}
      data-connecting={connectionMode}
      style={sizedStyle(bounds)}
      onPointerDown={onPointerDown}
    >
      <span className="spatial-canvas__item-label">{label}</span>
      {connectionMode ? <ConnectionHandles /> : null}
    </button>
  );
}

/** Renders an accessible comment marker at a world-space point. */
export function SpatialCanvasCommentPin({
  x,
  y,
  label,
  selected = false,
  children,
  onClick,
}: Positioned & {
  label: string;
  selected?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="spatial-canvas__comment-pin"
      data-selected={selected}
      style={positionStyle({ x, y })}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Renders a participant cursor at a world-space point. */
export function SpatialCanvasCursor({
  x,
  y,
  color,
  children,
}: Positioned & { color: string; children: ReactNode }) {
  return (
    <span
      className="spatial-canvas__cursor"
      style={{ color, ...positionStyle({ x, y }) }}
      aria-hidden="true"
    >
      <MousePointer2 size={16} />
      <span className="spatial-canvas__cursor-label">
        <span>{children}</span>
      </span>
    </span>
  );
}

/** Renders a world-space rectangular selection marquee. */
export function SpatialCanvasMarquee(bounds: Sized) {
  return (
    <div
      className="spatial-canvas__marquee"
      style={sizedStyle(bounds)}
    />
  );
}
