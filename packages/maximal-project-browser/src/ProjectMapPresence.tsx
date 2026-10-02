import type { SpatialCanvasCursorState } from "@maximal/maximal-electron/renderer"

import type { ProjectMapTool } from "./model.ts"

export function projectMapCursorState(
  tool: ProjectMapTool,
  active: "pan" | "move" | "marquee" | undefined,
  chatOpen: boolean,
): SpatialCanvasCursorState {
  if (chatOpen) return "chat"
  if (active === "pan") return "panning"
  if (active === "move") return "move"
  if (active === "marquee") return "crosshair"
  if (tool === "hand") return "pan"
  if (tool === "sticky") return "text"
  if (tool === "comment") return "comment"
  if (tool === "select") return "select"
  return "crosshair"
}
