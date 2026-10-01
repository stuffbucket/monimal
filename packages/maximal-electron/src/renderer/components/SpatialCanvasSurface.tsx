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
  embedded = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  testId?: string;
  embedded?: boolean;
}) {
  if (!open) return null;

  if (embedded) {
    return (
      <section
        aria-label={title}
        aria-description={description}
        className="spatial-canvas-surface spatial-canvas-surface--embedded"
        data-testid={testId}
      >
        {children}
      </section>
    );
  }

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
