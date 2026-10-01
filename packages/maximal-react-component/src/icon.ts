export function createIcon(
  documentObject: Document,
  pathData: string,
): SVGSVGElement {
  const icon = documentObject.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  )
  icon.setAttribute("aria-hidden", "true")
  icon.setAttribute("viewBox", "0 0 24 24")
  const path = documentObject.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  )
  path.setAttribute("d", pathData)
  icon.append(path)
  return icon
}
