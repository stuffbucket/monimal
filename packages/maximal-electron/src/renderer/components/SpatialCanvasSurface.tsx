import type { ReactNode } from "react";

import { Dialog } from "./controls/Overlays.js";

/** Hosts a spatial canvas as an edge-to-edge window control surface. */
export function SpatialCanvasSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="spatial-canvas-surface"
      overlayClassName="spatial-canvas-surface__overlay"
      testId={testId}
    >
      {children}
    </Dialog>
  );
}
