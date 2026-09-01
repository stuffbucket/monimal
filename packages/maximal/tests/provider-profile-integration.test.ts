import type {
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
} from "@stuffbucket/maximal-core/provider-host"
import type {
  ProviderDispatch,
  ProviderGateway,
  ProviderOperation,
} from "@stuffbucket/maximal-provider-contract"

import { afterEach, describe, expect, test } from "bun:test"
import { once } from "node:events"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import http from "node:http"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { createDshProviderGateway } from "../src/provider-gateway"

const require = createRequire(import.meta.url)
const API_KEY = "profile-integration-key"
const tempDirectories = new Set<string>()

interface Endpoint {
  readonly baseUrl: string
  readonly requests: Array<{
    readonly authorization: string | undefined
    readonly body?: unknown
    readonly method: string | undefined
    readonly url: string | undefined
  }>
  close(): Promise<void>
}

class ConfigSource implements ProviderHostConfigSource {
  readonly #listeners = new Set<(value: ProviderHostConfigSnapshot) => void>()
  #snapshot: ProviderHostConfigSnapshot

  constructor(initial: ProviderHostConfigSnapshot) {
    this.#snapshot = initial
  }

  getSnapshot(): ProviderHostConfigSnapshot {
    return this.#snapshot
  }

  subscribe(listener: (value: ProviderHostConfigSnapshot) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  publish(value: ProviderHostConfigSnapshot): void {
    this.#snapshot = value
    for (const listener of this.#listeners) listener(value)
  }

  dispose(): Promise<void> {
    this.#listeners.clear()
    return Promise.resolve()
  }
}

function packageRoot(name: string): string {
  return dirname(require.resolve(`${name}/package.json`))
}

async function linkPackage(
  nodeModules: string,
  name: string,
  target = packageRoot(name),
): Promise<void> {
  const destination = join(nodeModules, ...name.split("/"))
  await mkdir(dirname(destination), { recursive: true })
  await symlink(target, destination, "dir")
}

async function materializeOmlx(nodeModules: string): Promise<void> {
  const packageDirectory = join(nodeModules, "@stuffbucket", "omlx")
  const outdir = join(packageDirectory, "dist")
  await mkdir(outdir, { recursive: true })
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dirname, "../../omlx/src/index.ts")],
    format: "esm",
    outdir,
    packages: "external",
    target: "bun",
  })
  if (!result.success) {
    throw new Error("Could not build the external oMLX integration fixture.")
  }
  await writeFile(
    join(packageDirectory, "package.json"),
    JSON.stringify({
      name: "@stuffbucket/omlx",
      version: "0.0.0",
      type: "module",
      exports: {
        ".": { import: "./dist/index.js" },
        "./package.json": "./package.json",
      },
      dependencies: { "@deepseek-ai/schemastery": "3.18.1" },
      peerDependencies: {
        "@deepseek-ai/cordis": "4.0.1",
        "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
      },
    }),
  )
}

async function createProfile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "maximal-omlx-profile-"))
  tempDirectories.add(directory)
  const nodeModules = join(directory, "node_modules")
  await mkdir(nodeModules, { recursive: true })
  for (const dependency of [
    "@deepseek-ai/cordis",
    "@deepseek-ai/dsh-attachment",
    "@deepseek-ai/dsh-brand",
    "@deepseek-ai/dsh-invariants",
    "@deepseek-ai/dsh-llm",
    "@deepseek-ai/dsh-timeout",
    "@deepseek-ai/schemastery",
  ]) {
    await linkPackage(nodeModules, dependency)
  }
  await materializeOmlx(nodeModules)
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@deepseek-ai/cordis": "4.0.1",
        "@deepseek-ai/dsh-attachment": "0.1.0-rc.6",
        "@deepseek-ai/dsh-brand": "0.1.0-rc.6",
        "@deepseek-ai/dsh-invariants": "0.1.0-rc.6",
        "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
        "@deepseek-ai/dsh-timeout": "0.1.0-rc.6",
        "@deepseek-ai/schemastery": "3.18.1",
        "@stuffbucket/omlx": "0.0.0",
      },
    }),
  )
  await writeFile(
    join(directory, "providers.json"),
    JSON.stringify({
      schemaVersion: 1,
      runtime: {
        cordis: "@deepseek-ai/cordis",
        llm: "@deepseek-ai/dsh-llm",
      },
      services: [],
      plugins: [
        {
          id: "omlx",
          package: "@stuffbucket/omlx",
          providers: ["local"],
        },
      ],
    }),
  )
  return directory
}

function event(type: string, value: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`
}

function textStream(text: string): string {
  return (
    ": keepalive\n\n"
    + event("message_start", {
      type: "message_start",
      message: {
        id: "msg_integration",
        type: "message",
        role: "assistant",
        model: "mlx-model",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 0 },
      },
    })
    + event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })
    + event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    })
    + event("content_block_stop", {
      type: "content_block_stop",
      index: 0,
    })
    + event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { input_tokens: 4, output_tokens: 2 },
    })
    + event("message_stop", { type: "message_stop" })
  )
}

async function listen(): Promise<Endpoint> {
  const requests: Endpoint["requests"] = []
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      requests.push({
        authorization: request.headers.authorization,
        method: request.method,
        url: request.url,
      })
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          data: [{ id: "mlx-model", display_name: "MLX Model" }],
        }),
      )
      return
    }
    if (request.method === "POST" && request.url === "/v1/messages") {
      const chunks: Array<Uint8Array> = []
      for await (const chunk of request as unknown as AsyncIterable<unknown>) {
        if (typeof chunk === "string") chunks.push(Buffer.from(chunk))
        else if (chunk instanceof Uint8Array) chunks.push(chunk)
        else throw new TypeError("The oMLX fixture received an invalid body.")
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
      requests.push({
        authorization: request.headers.authorization,
        body,
        method: request.method,
        url: request.url,
      })
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.end(textStream("through composition"))
      return
    }
    response.writeHead(404)
    response.end()
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("The oMLX integration server did not bind a TCP port.")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      )
    },
  }
}

interface SnapshotOptions {
  readonly apiKey?: string
  readonly appDataDirectory: string
  readonly baseUrl: string
  readonly profileDirectory: string
}

function snapshot(options: SnapshotOptions): ProviderHostConfigSnapshot {
  const {
    apiKey = API_KEY,
    appDataDirectory,
    baseUrl,
    profileDirectory,
  } = options
  return {
    appDataDirectory,
    configStatus: { state: "ready" },
    defaultProfileDirectory: profileDirectory,
    providerHost: { mode: "dsh", profileDirectory },
    providerPlugins: {
      omlx: {
        enabled: true,
        config: {
          instances: {
            local: { apiKey, baseUrl },
          },
        },
      },
    },
    providers: {},
  }
}

async function dispatch(
  gateway: ProviderGateway,
  operation: ProviderOperation,
  body?: unknown,
): Promise<Response> {
  const controller = new AbortController()
  const request = new Request(`http://localhost/local/v1/${operation}`, {
    method: operation === "models" ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
    signal: controller.signal,
  })
  const input: ProviderDispatch = {
    operation,
    provider: "local",
    request,
    signal: controller.signal,
  }
  return await gateway.dispatch(input)
}

interface RunningSidecar {
  readonly proxyUrl: string
  stop(): Promise<void>
}

async function drainLines(
  stream: ReadableStream<Uint8Array>,
  lines: Array<string>,
  onLine?: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ""
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.trim().length > 0) {
        lines.push(line)
        onLine?.(line)
      }
      newline = buffer.indexOf("\n")
    }
  }
  if (buffer.trim().length > 0) {
    lines.push(buffer)
    onLine?.(buffer)
  }
}

async function startCompiledSidecar(
  binary: string,
  appDataDirectory: string,
): Promise<RunningSidecar> {
  const process = Bun.spawn({
    cmd: [
      binary,
      `--api-home=${appDataDirectory}`,
      "start",
      "--port",
      "0",
      "--control-port",
      "0",
    ],
    env: {
      ...globalThis.process.env,
      COPILOT_API_ENTERPRISE_URL: "",
      COPILOT_API_OAUTH_APP: "",
      GITHUB_TOKEN: "",
      MAXIMAL_SIDECAR_PARENT_PID: String(globalThis.process.pid),
    },
    stderr: "pipe",
    stdout: "pipe",
  })
  const lines: Array<string> = []
  let resolveReady: (port: number) => void
  const ready = new Promise<number>((resolvePort) => {
    resolveReady = resolvePort
  })
  void drainLines(process.stdout, lines, (line) => {
    const prefix = "@@MAXIMAL_READY@@ "
    if (!line.startsWith(prefix)) return
    const parsed = JSON.parse(line.slice(prefix.length)) as {
      readonly proxyPort?: unknown
    }
    if (typeof parsed.proxyPort === "number") resolveReady(parsed.proxyPort)
  })
  void drainLines(process.stderr, lines)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const port = await Promise.race([
      ready,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Compiled sidecar did not become ready.\n${lines.join("\n")}`,
              ),
            ),
          30_000,
        )
      }),
    ])
    return {
      proxyUrl: `http://127.0.0.1:${port}`,
      async stop() {
        process.kill("SIGTERM")
        await process.exited
      },
    }
  } catch (error) {
    process.kill("SIGTERM")
    await process.exited
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

afterEach(async () => {
  await Promise.all(
    [...tempDirectories].map(async (directory) => {
      tempDirectories.delete(directory)
      await rm(directory, { force: true, recursive: true })
    }),
  )
})

describe("external oMLX profile integration", () => {
  test("loads through composition and preserves user configuration", async () => {
    const endpoint = await listen()
    const profileDirectory = await createProfile()
    const appDataDirectory = await mkdtemp(
      join(tmpdir(), "maximal-user-config-"),
    )
    tempDirectories.add(appDataDirectory)
    const configPath = join(appDataDirectory, "config.json")
    const originalConfig = `${JSON.stringify({ marker: "do-not-rewrite" }, null, 2)}\n`
    await writeFile(configPath, originalConfig)
    const initial = snapshot({
      appDataDirectory,
      baseUrl: endpoint.baseUrl,
      profileDirectory,
    })
    const source = new ConfigSource(initial)
    let gateway: ProviderGateway | undefined

    try {
      gateway = await createDshProviderGateway({
        config: initial,
        configSource: source,
      })

      expect(gateway.getStatus("local")?.state).toBe("available")
      const models = await dispatch(gateway, "models")
      expect(models.status).toBe(200)
      expect(await models.json()).toMatchObject({
        data: [{ id: "mlx-model", display_name: "MLX Model" }],
      })

      const request = {
        model: "mlx-model",
        max_tokens: 64,
        messages: [{ role: "user", content: "hello" }],
      }
      const nonStreaming = await dispatch(gateway, "messages", {
        ...request,
        stream: false,
      })
      expect(nonStreaming.status).toBe(200)
      expect(await nonStreaming.json()).toMatchObject({
        content: [{ type: "text", text: "through composition" }],
        usage: { input_tokens: 4, output_tokens: 2 },
      })

      const streaming = await dispatch(gateway, "messages", {
        ...request,
        stream: true,
      })
      expect(streaming.status).toBe(200)
      expect(streaming.headers.get("content-type")).toContain(
        "text/event-stream",
      )
      const streamed = await streaming.text()
      expect(streamed).toContain("through composition")
      expect(streamed).toContain("message_stop")
      expect(streamed).not.toContain("keepalive")

      expect(endpoint.requests).toHaveLength(5)
      for (const upstream of endpoint.requests) {
        expect(upstream.authorization).toBe(`Bearer ${API_KEY}`)
      }
      const messageRequests = endpoint.requests.filter(
        (upstream) => upstream.url === "/v1/messages",
      )
      expect(messageRequests).toHaveLength(2)
      for (const upstream of messageRequests) {
        expect(upstream.body).toMatchObject({
          model: "mlx-model",
          stream: true,
        })
      }

      source.publish({
        ...initial,
        providerHost: { mode: "legacy" },
      })
      await gateway.dispose()
      gateway = undefined
      expect(await readFile(configPath, "utf8")).toBe(originalConfig)
    } finally {
      await gateway?.dispose()
      await source.dispose()
      await endpoint.close()
    }
  })
})

describe("compiled external oMLX profile integration", () => {
  test.skipIf(process.env.MAXIMAL_E2E_BINARY === undefined)(
    "loads the external profile from the compiled sidecar",
    async () => {
      const binary = process.env.MAXIMAL_E2E_BINARY
      if (binary === undefined) {
        throw new Error("MAXIMAL_E2E_BINARY was not provided.")
      }

      const endpoint = await listen()
      const profileDirectory = await createProfile()
      const appDataDirectory = await mkdtemp(
        join(tmpdir(), "maximal-sidecar-config-"),
      )
      tempDirectories.add(appDataDirectory)
      const configPath = join(appDataDirectory, "config.json")
      const config = `${JSON.stringify(
        {
          auth: { enforce: false },
          checkUpdates: false,
          enforceVersionFloor: false,
          providerHost: { mode: "dsh", profileDirectory },
          providerPlugins: {
            omlx: {
              enabled: true,
              config: {
                instances: {
                  local: { apiKey: API_KEY, baseUrl: endpoint.baseUrl },
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`
      await writeFile(configPath, config)
      let sidecar: RunningSidecar | undefined

      try {
        sidecar = await startCompiledSidecar(binary, appDataDirectory)
        const models = await fetch(`${sidecar.proxyUrl}/local/v1/models`)
        expect(models.status).toBe(200)
        expect(await models.json()).toMatchObject({
          data: [{ id: "mlx-model" }],
        })

        const messages = await fetch(`${sidecar.proxyUrl}/local/v1/messages`, {
          body: JSON.stringify({
            model: "mlx-model",
            max_tokens: 64,
            messages: [{ role: "user", content: "hello" }],
            stream: false,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
        expect(messages.status).toBe(200)
        expect(await messages.json()).toMatchObject({
          content: [{ type: "text", text: "through composition" }],
        })
        expect(await readFile(configPath, "utf8")).toBe(config)
      } finally {
        await sidecar?.stop()
        await endpoint.close()
      }
    },
    60_000,
  )
})

describe("live external oMLX profile integration", () => {
  test.skipIf(
    process.env.MAXIMAL_E2E_BINARY === undefined
      || process.env.OMLX_LIVE_API_KEY === undefined
      || process.env.OMLX_LIVE_BASE_URL === undefined
      || process.env.OMLX_LIVE_MODEL === undefined,
  )(
    "drives a live oMLX model through source and compiled composition",
    async () => {
      const binary = process.env.MAXIMAL_E2E_BINARY
      const apiKey = process.env.OMLX_LIVE_API_KEY
      const baseUrl = process.env.OMLX_LIVE_BASE_URL
      const model = process.env.OMLX_LIVE_MODEL
      if (
        binary === undefined
        || apiKey === undefined
        || baseUrl === undefined
        || model === undefined
      ) {
        throw new Error("The live oMLX test environment is incomplete.")
      }

      const profileDirectory = await createProfile()
      const sourceDataDirectory = await mkdtemp(
        join(tmpdir(), "maximal-live-source-"),
      )
      tempDirectories.add(sourceDataDirectory)
      const initial = snapshot({
        apiKey,
        appDataDirectory: sourceDataDirectory,
        baseUrl,
        profileDirectory,
      })
      const source = new ConfigSource(initial)
      let gateway: ProviderGateway | undefined

      try {
        gateway = await createDshProviderGateway({
          config: initial,
          configSource: source,
        })
        const models = await dispatch(gateway, "models")
        expect(models.status).toBe(200)
        expect(await models.text()).toContain(model)

        const request = {
          model,
          max_tokens: 32,
          messages: [
            {
              role: "user",
              content: "Respond briefly to confirm that local inference works.",
            },
          ],
        }
        const generated = await dispatch(gateway, "messages", {
          ...request,
          stream: false,
        })
        expect(generated.status).toBe(200)
        expect(await generated.json()).toMatchObject({
          type: "message",
          role: "assistant",
        })

        const streamed = await dispatch(gateway, "messages", {
          ...request,
          stream: true,
        })
        expect(streamed.status).toBe(200)
        const streamText = await streamed.text()
        expect(streamText).toContain("message_stop")
        expect(streamText).not.toContain("keep-alive")
        expect(streamText).not.toContain('"type":"ping"')

        const abort = new AbortController()
        const abortRequest = new Request("http://localhost/local/v1/messages", {
          body: JSON.stringify({ ...request, stream: true }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: abort.signal,
        })
        const abortResponse = await gateway.dispatch({
          operation: "messages",
          provider: "local",
          request: abortRequest,
          signal: abort.signal,
        })
        const reader = abortResponse.body?.getReader()
        abort.abort()
        await reader?.cancel()
      } finally {
        await gateway?.dispose()
        await source.dispose()
      }

      const sidecarDataDirectory = await mkdtemp(
        join(tmpdir(), "maximal-live-sidecar-"),
      )
      tempDirectories.add(sidecarDataDirectory)
      const configPath = join(sidecarDataDirectory, "config.json")
      const config = `${JSON.stringify(
        {
          auth: { enforce: false },
          checkUpdates: false,
          enforceVersionFloor: false,
          providerHost: { mode: "dsh", profileDirectory },
          providerPlugins: {
            omlx: {
              enabled: true,
              config: {
                instances: { local: { apiKey, baseUrl } },
              },
            },
          },
        },
        null,
        2,
      )}\n`
      await writeFile(configPath, config)
      let sidecar: RunningSidecar | undefined
      try {
        sidecar = await startCompiledSidecar(binary, sidecarDataDirectory)
        const models = await fetch(`${sidecar.proxyUrl}/local/v1/models`)
        expect(models.status).toBe(200)
        expect(await models.text()).toContain(model)

        const generated = await fetch(`${sidecar.proxyUrl}/local/v1/messages`, {
          body: JSON.stringify({
            model,
            max_tokens: 32,
            messages: [
              {
                role: "user",
                content: "Respond briefly to confirm the sidecar works.",
              },
            ],
            stream: false,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
        expect(generated.status).toBe(200)
        expect(await generated.json()).toMatchObject({
          type: "message",
          role: "assistant",
        })
        expect(await readFile(configPath, "utf8")).toBe(config)
      } finally {
        await sidecar?.stop()
      }
    },
    240_000,
  )
})
