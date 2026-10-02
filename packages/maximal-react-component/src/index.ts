import type {
  ConfigEnv,
  IndexHtmlTransformResult,
  Plugin,
  PluginOption,
  ResolvedConfig,
} from "vite"

import { existsSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { INSPECTOR_STYLE_ID } from "./constants.js"
import { inspectorStyles } from "./inspector-card.js"

const CLIENT_MODULE = "@maximal/maximal-react-component/client"
const EDITOR_PATH = "__open-in-editor"
const POSITION = /:\d+(?::\d+)?$/u

export function normalizeEditorFile(
  file: string,
  root: string,
  fileExists: (path: string) => boolean = existsSync,
): string {
  const position = file.match(POSITION)?.[0] ?? ""
  const sourceWithQuery = file.slice(0, file.length - position.length)
  const source = sourceWithQuery.replace(/[?#].*$/u, "")
  let filesystemPath = source
  if (source.startsWith("file://")) {
    filesystemPath = fileURLToPath(source)
  } else if (source.startsWith("/@fs/")) {
    filesystemPath = decodeURIComponent(source.slice("/@fs".length))
  }

  if (!isAbsolute(filesystemPath)) {
    filesystemPath = resolve(root, filesystemPath)
  } else if (!fileExists(filesystemPath)) {
    const rootRelative = resolve(root, `.${filesystemPath}`)
    if (fileExists(rootRelative)) filesystemPath = rootRelative
  }
  return `${filesystemPath}${position}`
}

export function normalizeEditorRequestUrl(
  requestUrl: string,
  root: string,
  base: string,
): string {
  const endpoint = `${base.endsWith("/") ? base : `${base}/`}${EDITOR_PATH}`
  const url = new URL(requestUrl, "http://vite.local")
  if (url.pathname !== endpoint && url.pathname !== `/${EDITOR_PATH}`) {
    return requestUrl
  }
  const file = url.searchParams.get("file")
  if (!file) return requestUrl
  url.searchParams.set("file", normalizeEditorFile(file, root))
  return `${url.pathname}${url.search}${url.hash}`
}

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
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url) {
          request.url = normalizeEditorRequestUrl(request.url, root, base)
        }
        next()
      })
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
