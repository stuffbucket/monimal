const VIEWPORT_GUTTER = 16
// Below this, a side cannot show the card's header and controls.
const MINIMUM_CARD_SPACE = 120

export function positionInspectorCard(
  card: HTMLElement,
  target: HTMLElement,
  windowObject: Pick<Window, "innerHeight" | "innerWidth">,
): void {
  const rect = target.getBoundingClientRect()
  const spaceAbove = rect.top
  const spaceBelow = windowObject.innerHeight - rect.bottom

  if (Math.max(spaceAbove, spaceBelow) < MINIMUM_CARD_SPACE) {
    // The target fills the viewport, so either side would place the card
    // outside it; keep the card inside the bottom gutter instead.
    card.style.bottom = `${VIEWPORT_GUTTER}px`
    card.style.top = ""
    card.style.maxHeight = `${windowObject.innerHeight - VIEWPORT_GUTTER * 2}px`
  } else if (spaceBelow >= spaceAbove) {
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
