export function newItemDefinition(tool: "sticky" | "shape" | "section") {
  if (tool === "section") return { width: 720, height: 440, text: "Section" }
  if (tool === "sticky") return { width: 176, height: 136, text: "Sticky note" }
  return { width: 176, height: 104, text: "Diagram" }
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
