import type {
  IndexHtmlTransformResult,
  Plugin,
  ResolvedConfig,
  TransformResult,
} from "vite"

import { describe, expect, it } from "vitest"

import { INSPECTOR_STYLE_ID } from "../src/constants.js"
import {
  createReactComponentInspectorPlugin,
  injectReactSourceMetadata,
  maximalReactComponent,
} from "../src/index.js"
import { inspectorStyles } from "../src/inspector-card.js"

interface InspectorPlugin extends Plugin {
  configResolved(config: ResolvedConfig): void
  transform: {
    filter: {
      id: RegExp
    }
    handler(code: string): TransformResult
  }
  transformIndexHtml: {
    handler(): IndexHtmlTransformResult
    order: "pre"
  }
}

function inspectorPlugin(): InspectorPlugin {
  return createReactComponentInspectorPlugin() as InspectorPlugin
}

describe("React component inspector Vite plugin", () => {
  it("matches the 4.2.3 oracle's development-only activation", () => {
    expect(maximalReactComponent("build")).toEqual([])

    const plugins = maximalReactComponent("serve")
    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({ name: "react-click-to-component" })
  })

  it("matches the oracle's React development runtime filter", () => {
    const filter = inspectorPlugin().transform.filter.id

    expect(filter.test("/react/jsx-dev-runtime.js")).toBe(true)
    expect(filter.test("/react/jsx-dev-runtime.development.js")).toBe(true)
    expect(filter.test("/react/jsx-runtime.js")).toBe(false)
  })

  it("injects the package-owned client with resolved root and base", () => {
    const plugin = inspectorPlugin()
    plugin.configResolved({
      root: "/workspace/maximal",
      base: "/desktop/",
    } as ResolvedConfig)

    expect(plugin.transformIndexHtml.order).toBe("pre")
    expect(plugin.transformIndexHtml.handler()).toEqual([
      {
        tag: "style",
        attrs: { "data-vite-dev-id": INSPECTOR_STYLE_ID },
        children: inspectorStyles,
      },
      {
        tag: "script",
        attrs: { type: "module" },
        children:
          "import { installReactComponentInspector } from "
          + '"@maximal/maximal-react-component/client";\n'
          + 'installReactComponentInspector({"root":"/workspace/maximal",'
          + '"base":"/desktop/"});',
      },
    ])
  })

  it("uses empty Vite defaults before configuration resolves", () => {
    expect(inspectorPlugin().transformIndexHtml.handler()).toEqual([
      {
        tag: "style",
        attrs: { "data-vite-dev-id": INSPECTOR_STYLE_ID },
        children: inspectorStyles,
      },
      {
        tag: "script",
        attrs: { type: "module" },
        children:
          "import { installReactComponentInspector } from "
          + '"@maximal/maximal-react-component/client";\n'
          + 'installReactComponentInspector({"root":"","base":""});',
      },
    ])
  })

  it("connects the Vite transform hook to metadata repair", () => {
    expect(
      inspectorPlugin().transform.handler('"_debugInfo"; value: null'),
    ).toBe('"_debugInfo"; value: source')
  })
})

describe("React 19 source metadata transform", () => {
  it("leaves runtimes with existing source metadata unchanged", () => {
    expect(
      injectReactSourceMetadata(
        'const _source = true; "_debugInfo"; value: null',
      ),
    ).toBeUndefined()
  })

  it("leaves unrecognized development runtimes unchanged", () => {
    expect(injectReactSourceMetadata("value: null")).toBeUndefined()
    expect(
      injectReactSourceMetadata('"_debugInfo"; value: something'),
    ).toBeUndefined()
  })

  it("repairs an oracle-style runtime that already accepts source", () => {
    const source =
      'function ReactElement(type, key, self, source, owner) { "_debugInfo";'
      + " value: null; maybeKey, isStaticChildren;"
      + " ReactElement(foo, debugStack, debugTask); }"

    expect(injectReactSourceMetadata(source)).toBe(
      'function ReactElement(type, key, self, source, owner) { "_debugInfo";'
        + " value: source; maybeKey, isStaticChildren;"
        + " ReactElement(foo, debugStack, debugTask); }",
    )
  })

  it("threads source through the React 19 runtime signatures", () => {
    const source = [
      '"_debugInfo"; value: null;',
      "jsxDEV(type, config, maybeKey,\n isStaticChildren, source);",
      "ReactElement(foo, debugStack, debugTask);",
      "ReactElement(source, debugStack, debugTask);",
      "ReactElement(, debugStack, debugTask);",
    ].join("\n")

    expect(injectReactSourceMetadata(source)).toBe(
      [
        '"_debugInfo"; value: source;',
        "jsxDEV(type, config, maybeKey, isStaticChildren, source, source);",
        "ReactElement(foo, debugStack, debugTask, source);",
        "ReactElement(source, debugStack, debugTask);",
        "ReactElement(, debugStack, debugTask, source);",
      ].join("\n"),
    )
  })
})
