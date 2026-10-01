import type {
  ConfigEnv,
  IndexHtmlTransformResult,
  Plugin,
  PluginOption,
  ResolvedConfig,
} from "vite"

import { INSPECTOR_STYLE_ID } from "./constants.js"
import { inspectorStyles } from "./inspector-card.js"

const CLIENT_MODULE = "@maximal/maximal-react-component/client"

export function injectReactSourceMetadata(code: string): string | undefined {
  if (code.includes("_source")) return undefined

  const debugInfoIndex = code.indexOf('"_debugInfo"')
  if (debugInfoIndex === -1) return undefined

  const nullSourceIndex = code.indexOf("value: null", debugInfoIndex)
  if (nullSourceIndex === -1) return undefined

  let transformed =
    code.slice(0, nullSourceIndex)
    + "value: source"
    + code.slice(nullSourceIndex + "value: null".length)

  if (code.includes("function ReactElement(type, key, self, source,")) {
    return transformed
  }

  transformed = transformed.replaceAll(
    /maybeKey,\s*isStaticChildren/gu,
    "maybeKey, isStaticChildren, source",
  )
  return transformed.replaceAll(
    /(\w+)?,\s*debugStack,\s*debugTask/gu,
    (match, previousArgument: string | undefined) =>
      previousArgument === "source" ? match : (
        match.replace("debugTask", "debugTask, source")
      ),
  )
}

export function createReactComponentInspectorPlugin(): Plugin {
  let root = ""
  let base = ""

  return {
    name: "react-click-to-component",
    configResolved(config: ResolvedConfig) {
      root = config.root
      base = config.base
    },
    transform: {
      filter: { id: /jsx-dev-runtime(\.development)?\.js/u },
      handler(code) {
        return injectReactSourceMetadata(code)
      },
    },
    transformIndexHtml: {
      order: "pre",
      handler(): IndexHtmlTransformResult {
        const options = JSON.stringify({ root, base })
        return [
          {
            tag: "style",
            attrs: { "data-vite-dev-id": INSPECTOR_STYLE_ID },
            children: inspectorStyles,
          },
          {
            tag: "script",
            attrs: { type: "module" },
            children:
              `import { installReactComponentInspector } from ${JSON.stringify(CLIENT_MODULE)};\n`
              + `installReactComponentInspector(${options});`,
          },
        ]
      },
    },
  }
}

export function maximalReactComponent(
  command: ConfigEnv["command"],
): Array<PluginOption> {
  return command === "serve" ? [createReactComponentInspectorPlugin()] : []
}
