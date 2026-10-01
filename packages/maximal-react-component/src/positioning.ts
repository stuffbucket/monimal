export function positionInspectorCard(
  card: HTMLElement,
  target: HTMLElement,
  windowObject: Pick<Window, "innerHeight" | "innerWidth">,
): void {
  const rect = target.getBoundingClientRect()
  const spaceAbove = rect.top
  const spaceBelow = windowObject.innerHeight - rect.bottom

  if (spaceBelow >= spaceAbove) {
    card.style.top = `${rect.bottom + 8}px`
    card.style.bottom = ""
    card.style.maxHeight = `${windowObject.innerHeight - rect.bottom - 24}px`
  } else {
    card.style.bottom = `${windowObject.innerHeight - rect.top + 8}px`
    card.style.top = ""
    card.style.maxHeight = `${rect.top - 24}px`
  }

  const cardWidth = card.getBoundingClientRect().width
  const maximumInset = Math.max(16, windowObject.innerWidth - cardWidth - 16)
  if (rect.left < windowObject.innerWidth / 2) {
    card.style.left = `${Math.min(Math.max(rect.left, 16), maximumInset)}px`
    card.style.right = ""
  } else {
    card.style.right = `${Math.min(
      Math.max(windowObject.innerWidth - rect.right, 16),
      maximumInset,
    )}px`
    card.style.left = ""
  }
}
