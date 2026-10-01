import {
  Ban,
  Crosshair,
  Grab,
  Hand,
  MessageCircle,
  MessagesSquare,
  MousePointer2,
  MousePointerClick,
  Move,
  MoveDiagonal,
  MoveDiagonal2,
  MoveHorizontal,
  MoveVertical,
  TextCursor,
} from "lucide-react";

import type { SPATIAL_CANVAS_CURSORS } from "./SpatialCanvasStyles.js";

export type SpatialCanvasCursorState =
  | keyof typeof SPATIAL_CANVAS_CURSORS
  | "comment"
  | "chat";

function SelectionCaret() {
  return (
    <MousePointer2
      aria-hidden="true"
      data-cursor-part="caret"
      fill="currentColor"
      size={16}
      stroke="var(--shell-canvas)"
    />
  );
}

export function SpatialCanvasCursorGlyph({
  state,
}: {
  state: SpatialCanvasCursorState;
}) {
  const props = { "aria-hidden": true, size: 16 };
  if (state === "select") return <SelectionCaret />;
  if (state === "unavailable") {
    return (
      <span className="spatial-canvas__cursor-unavailable">
        <SelectionCaret />
        <Ban
          {...props}
          className="spatial-canvas__cursor-unavailable-badge"
          fill="var(--shell-canvas)"
        />
      </span>
    );
  }
  if (state === "pan") return <Hand {...props} />;
  if (state === "panning") return <Grab {...props} />;
  if (state === "crosshair") return <Crosshair {...props} />;
  if (state === "text") return <TextCursor {...props} />;
  if (state === "resizeColumn") return <MoveHorizontal {...props} />;
  if (state === "resizeRow") return <MoveVertical {...props} />;
  if (state === "resizeNorthwestSoutheast") return <MoveDiagonal {...props} />;
  if (state === "resizeNortheastSouthwest") return <MoveDiagonal2 {...props} />;
  if (state === "move") return <Move {...props} />;
  if (state === "action") return <MousePointerClick {...props} />;
  if (state === "comment") return <MessageCircle {...props} />;
  return <MessagesSquare {...props} />;
}
