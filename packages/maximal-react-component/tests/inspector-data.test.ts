import { afterEach, describe, expect, it, vi } from "vitest"

import { INSPECTOR_STYLE_ID } from "../src/constants.js"
import {
  assignedCssValues,
  boxModelForElement,
  computedCssValues,
} from "../src/inspector-data.js"

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
})

describe("inspector data", () => {
  it("collects inline and matched stylesheet declarations with source paths", () => {
    const style = document.createElement("style")
    style.dataset["viteDevId"] = "/workspace/maximal/src/card.css"
    style.textContent =
      "\n.target {\n  color: red;\n  opacity: 1;\n}\n"
      + ".target {\n  color: blue;\n  padding: 8px;\n}"
    document.head.append(style)
    const inspectorStyle = document.createElement("style")
    inspectorStyle.dataset["viteDevId"] = INSPECTOR_STYLE_ID
    inspectorStyle.textContent = ".target { outline: 2px solid blue; }"
    document.head.append(inspectorStyle)
    const target = document.createElement("div")
    target.className = "target"
    target.style.marginTop = "12px"
    document.body.append(target)

    const result = assignedCssValues(target, document, "/workspace/maximal")

    expect(result.inaccessibleStyleSheets).toBe(0)
    expect(result.values.map((value) => value.property)).toEqual([
      "color",
      "margin-top",
      "padding",
    ])
    expect(
      result.values.filter((value) => value.property === "color"),
    ).toHaveLength(1)
    expect(
      result.values.find((value) => value.property === "color")?.source?.path,
    ).toBe("/workspace/maximal/src/card.css:2:1")
    expect(result.values.find((value) => value.property === "color")).toEqual({
      property: "color",
      source: {
        label: ".target · src/card.css:2",
        path: "/workspace/maximal/src/card.css:2:1",
      },
      value: "blue",
    })
    expect(
      result.values.find((value) => value.property === "margin-top"),
    ).toEqual({
      property: "margin-top",
      source: { label: "element.style" },
      value: "12px",
    })
    expect(result.values.some((value) => value.property === "opacity")).toBe(
      false,
    )
    expect(result.values.some((value) => value.property === "outline")).toBe(
      false,
    )
    expect(
      computedCssValues(target, globalThis.window)
        .map((value) => value.property)
        .slice()
        .sort(),
    ).toEqual(
      computedCssValues(target, globalThis.window).map(
        (value) => value.property,
      ),
    )
  })

  it("measures box-model edges and the content rectangle", () => {
    const target = document.createElement("div")
    target.style.cssText = "border: 2px solid; margin: 4px; padding: 8px 10px;"
    target.getBoundingClientRect = () =>
      ({
        bottom: 160,
        height: 100,
        left: 50,
        right: 250,
        top: 60,
        width: 200,
      }) as DOMRect
    document.body.append(target)

    expect(boxModelForElement(target, globalThis.window)).toEqual({
      border: { bottom: 2, left: 2, right: 2, top: 2 },
      content: { height: 80, width: 176 },
      margin: { bottom: 4, left: 4, right: 4, top: 4 },
      padding: { bottom: 8, left: 10, right: 10, top: 8 },
      position: {
        bottom: 160,
        left: 50,
        right: 250,
        top: 60,
      },
    })
  })

  it("reports inaccessible sheets and rejects unexpected CSSOM failures", () => {
    const target = document.createElement("div")
    target.style.color = "red"
    document.body.append(target)
    const style = document.createElement("style")
    document.head.append(style)
    const sheet = style.sheet
    if (!sheet) throw new Error("Expected a stylesheet")
    Object.defineProperty(sheet, "cssRules", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked", "SecurityError")
      },
    })

    expect(assignedCssValues(target, document, "/workspace/maximal")).toEqual({
      inaccessibleStyleSheets: 1,
      values: [
        {
          property: "color",
          source: { label: "element.style" },
          value: "red",
        },
      ],
    })

    Object.defineProperty(sheet, "cssRules", {
      configurable: true,
      get: () => {
        throw new TypeError("Broken CSSOM")
      },
    })
    expect(() =>
      assignedCssValues(target, document, "/workspace/maximal"),
    ).toThrow("Broken CSSOM")
  })

  it("skips unsupported selectors but rethrows other matching failures", () => {
    const style = document.createElement("style")
    style.textContent = ".target { color: red; }"
    document.head.append(style)
    const target = document.createElement("div")
    target.className = "target"
    document.body.append(target)
    const matches = vi.spyOn(target, "matches")
    matches.mockImplementation(() => {
      throw new DOMException("Unsupported", "SyntaxError")
    })
    expect(
      assignedCssValues(target, document, "/workspace/maximal").values,
    ).toEqual([])

    matches.mockImplementation(() => {
      throw new TypeError("Matcher failed")
    })
    expect(() =>
      assignedCssValues(target, document, "/workspace/maximal"),
    ).toThrow("Matcher failed")
  })
})

describe("inspector data edge cases", () => {
  it("traverses grouped rules and resolves filesystem and root CSS sources", () => {
    const filesystemStyle = document.createElement("style")
    filesystemStyle.textContent =
      "@media screen {\n.target { color: green; }\n}"
    document.head.append(filesystemStyle)
    const filesystemSheet = filesystemStyle.sheet
    if (!filesystemSheet) throw new Error("Expected a filesystem stylesheet")
    Object.defineProperty(filesystemSheet, "href", {
      configurable: true,
      value: "https://example.test/@fs/workspace/maximal/src/grouped.css",
    })
    const rootStyle = document.createElement("style")
    rootStyle.textContent = ".target { background-color: black; }"
    document.head.append(rootStyle)
    const rootSheet = rootStyle.sheet
    if (!rootSheet) throw new Error("Expected a root stylesheet")
    Object.defineProperty(rootSheet, "href", {
      configurable: true,
      value: "https://example.test/src/root.css",
    })
    const anonymousStyle = document.createElement("style")
    anonymousStyle.textContent = ".target { opacity: 0.5; }"
    document.head.append(anonymousStyle)
    const target = document.createElement("div")
    target.className = "target"
    document.body.append(target)

    const values = assignedCssValues(
      target,
      document,
      "/workspace/maximal",
    ).values

    expect(values).toEqual([
      {
        property: "background-color",
        source: {
          label: ".target · src/root.css:1",
          path: "/workspace/maximal/src/root.css:1:1",
        },
        value: "black",
      },
      {
        property: "color",
        source: {
          label: ".target · src/grouped.css:2",
          path: "/workspace/maximal/src/grouped.css:2:1",
        },
        value: "green",
      },
      {
        property: "opacity",
        source: { label: ".target" },
        value: "0.5",
      },
    ])
  })

  it("retains declarations when the document has no computed-style window", () => {
    const isolated = document.implementation.createHTMLDocument()
    const target = isolated.createElement("div")
    target.style.cssText = "color: red; opacity: 1;"
    isolated.body.append(target)

    expect(
      assignedCssValues(target, isolated, "/workspace/maximal").values,
    ).toEqual([
      {
        property: "color",
        source: { label: "element.style" },
        value: "red",
      },
      {
        property: "opacity",
        source: { label: "element.style" },
        value: "1",
      },
    ])
  })
})
