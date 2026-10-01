import type { ProjectMapTool } from "./model.ts"

export const PROJECT_MAP_TOOLS: ReadonlyArray<{
  tool: ProjectMapTool
  label: string
  shortcut: string
}> = [
  { tool: "select", label: "Move", shortcut: "V" },
  { tool: "hand", label: "Hand", shortcut: "H" },
  { tool: "sticky", label: "Sticky note", shortcut: "S" },
  { tool: "shape", label: "Shape", shortcut: "O" },
  { tool: "section", label: "Section", shortcut: "⇧S" },
  { tool: "connector", label: "Connector", shortcut: "L" },
  { tool: "comment", label: "Comment", shortcut: "C" },
]

export function newItemDefinition(tool: "sticky" | "shape" | "section") {
  if (tool === "section") return { width: 640, height: 400, text: "Section" }
  if (tool === "sticky") return { width: 160, height: 112, text: "Sticky note" }
  return { width: 160, height: 88, text: "Diagram" }
}

export function selectionAfterPointer(
  selected: Set<string>,
  itemId: string,
  additive: boolean,
): Set<string> {
  if (!additive)
    return selected.has(itemId) ? new Set(selected) : new Set([itemId])
  const next = new Set(selected)
  if (next.has(itemId)) next.delete(itemId)
  else next.add(itemId)
  return next
}

export function arrowDelta(
  key: string,
  amount: number,
): { x: number; y: number } {
  if (key === "ArrowLeft") return { x: -amount, y: 0 }
  if (key === "ArrowRight") return { x: amount, y: 0 }
  if (key === "ArrowUp") return { x: 0, y: -amount }
  return { x: 0, y: amount }
}
