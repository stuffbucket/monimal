export interface CssValue {
  property: string
  source?: {
    label: string
    path?: string
  }
  value: string
}

export interface CssValueCollection {
  inaccessibleStyleSheets: number
  values: Array<CssValue>
}

export interface BoxEdges {
  bottom: number
  left: number
  right: number
  top: number
}

export interface BoxModel {
  border: BoxEdges
  content: { height: number; width: number }
  margin: BoxEdges
  padding: BoxEdges
  position: BoxEdges
}

function declarationValues(
  style: CSSStyleDeclaration,
  source?: CssValue["source"],
): Array<CssValue> {
  return Array.from({ length: style.length }, (_, index) => style.item(index))
    .filter(Boolean)
    .map((property) => ({
      property,
      ...(source ? { source } : {}),
      value: style.getPropertyValue(property).trim(),
    }))
}

function localStyleSource(
  sheet: CSSStyleSheet,
  selector: string,
  root: string,
): CssValue["source"] {
  const owner = sheet.ownerNode
  const viteId =
    owner instanceof globalThis.HTMLElement ?
      owner.dataset["viteDevId"]
    : undefined
  const href = sheet.href
  let path = viteId
  if (!path && href) {
    const url = new URL(href)
    path =
      url.pathname.startsWith("/@fs/") ?
        decodeURIComponent(url.pathname.slice("/@fs".length))
      : `${root}${url.pathname}`
  }
  if (!path) return { label: selector }

  const sourceText = owner?.textContent ?? ""
  const selectorIndex = sourceText.indexOf(selector)
  const line =
    selectorIndex === -1 ? 1 : (
      sourceText.slice(0, selectorIndex).split("\n").length
    )
  return {
    label: `${selector} · ${path.replace(`${root}/`, "")}:${String(line)}`,
    path: `${path}:${String(line)}:1`,
  }
}

interface RuleVisitContext {
  element: HTMLElement
  root: string
  values: Array<CssValue>
}

function ruleMatchesElement(rule: CSSStyleRule, element: HTMLElement): boolean {
  try {
    return element.matches(rule.selectorText)
  } catch (error) {
    if (error instanceof DOMException && error.name === "SyntaxError") {
      return false
    }
    throw error
  }
}

function visitRules(rules: CSSRuleList, context: RuleVisitContext): void {
  for (const rule of rules) {
    if (rule instanceof globalThis.CSSStyleRule) {
      if (!ruleMatchesElement(rule, context.element)) continue
      const sheet = rule.parentStyleSheet
      context.values.push(
        ...declarationValues(
          rule.style,
          sheet ?
            localStyleSource(sheet, rule.selectorText, context.root)
          : { label: rule.selectorText },
        ),
      )
    } else if ("cssRules" in rule) {
      visitRules((rule as CSSGroupingRule).cssRules, context)
    }
  }
}

function effectiveNonDefaultValues(
  element: HTMLElement,
  values: ReadonlyArray<CssValue>,
  documentObject: Document,
): Array<CssValue> {
  const windowObject = documentObject.defaultView
  if (!windowObject) return [...values]

  const actual = windowObject.getComputedStyle(element)
  const probe = documentObject.createElement(element.tagName)
  probe.style.setProperty("all", "initial", "important")
  probe.style.setProperty("position", "fixed", "important")
  probe.style.setProperty("visibility", "hidden", "important")
  documentObject.body.append(probe)
  const initial = windowObject.getComputedStyle(probe)
  const initialValues = new Map(
    values.map((value) => [
      value.property,
      initial.getPropertyValue(value.property).trim(),
    ]),
  )
  const effective = new Map<string, CssValue>()
  for (const value of values) {
    const actualValue = actual.getPropertyValue(value.property).trim()
    const initialValue = initialValues.get(value.property) ?? ""
    probe.style.setProperty(value.property, value.value, "important")
    const assignedValue = windowObject
      .getComputedStyle(probe)
      .getPropertyValue(value.property)
      .trim()
    probe.style.removeProperty(value.property)
    if (actualValue !== initialValue && assignedValue === actualValue) {
      effective.set(value.property, value)
    }
  }
  probe.remove()
  return [...effective.values()]
}

function removeExpandedShorthands(values: Array<CssValue>): Array<CssValue> {
  const properties = new Set(values.map((value) => value.property))
  return values.filter(
    (value) =>
      (!properties.has("margin") || !value.property.startsWith("margin-"))
      && (!properties.has("padding") || !value.property.startsWith("padding-")),
  )
}

export function assignedCssValues(
  element: HTMLElement,
  documentObject: Document,
  root: string,
): CssValueCollection {
  const values: Array<CssValue> = []
  let inaccessibleStyleSheets = 0
  for (const sheet of documentObject.styleSheets) {
    const owner = sheet.ownerNode
    if (
      owner instanceof globalThis.HTMLElement
      && owner.dataset["viteDevId"] === INSPECTOR_STYLE_ID
    ) {
      continue
    }
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        inaccessibleStyleSheets += 1
        continue
      }
      throw error
    }
    visitRules(rules, { element, root, values })
  }
  values.push(...declarationValues(element.style, { label: "element.style" }))
  return {
    inaccessibleStyleSheets,
    values: removeExpandedShorthands(
      effectiveNonDefaultValues(element, values, documentObject),
    ).sort((left, right) => left.property.localeCompare(right.property)),
  }
}

export function computedCssValues(
  element: HTMLElement,
  windowObject: Window,
): Array<CssValue> {
  return declarationValues(windowObject.getComputedStyle(element)).sort(
    (left, right) => left.property.localeCompare(right.property),
  )
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function edges(
  style: CSSStyleDeclaration,
  prefix: "border" | "margin" | "padding",
  suffix = "",
): BoxEdges {
  const value = (side: "bottom" | "left" | "right" | "top"): number => {
    if (
      prefix === "border"
      && style.getPropertyValue(`border-${side}-style`) === "none"
    ) {
      return 0
    }
    return pixels(style.getPropertyValue(`${prefix}-${side}${suffix}`))
  }
  return {
    bottom: value("bottom"),
    left: value("left"),
    right: value("right"),
    top: value("top"),
  }
}

export function boxModelForElement(
  element: HTMLElement,
  windowObject: Window,
): BoxModel {
  const style = windowObject.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const border = edges(style, "border", "-width")
  const padding = edges(style, "padding")
  return {
    border,
    content: {
      height: Math.max(
        0,
        rect.height - border.top - border.bottom - padding.top - padding.bottom,
      ),
      width: Math.max(
        0,
        rect.width - border.left - border.right - padding.left - padding.right,
      ),
    },
    margin: edges(style, "margin"),
    padding,
    position: {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
    },
  }
}

import { INSPECTOR_STYLE_ID } from "./constants.js"
