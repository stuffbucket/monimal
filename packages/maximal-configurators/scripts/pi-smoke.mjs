import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { SocketAddress } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { fileURLToPath, URL } from "node:url"
import { promisify } from "node:util"

import { startCoreFixture } from "./pi-core-fixture.mjs"

// Real Pi and Core processes + real loopback sockets; only the upstream is synthetic.
// This does not inspect user credentials, call a model, install Pi, or start Maximal UI.
const execute = promisify(execFile)
const binary = process.argv[2] ?? process.env.MAXIMAL_PI_BINARY ?? "pi"
const root = await mkdtemp(join(tmpdir(), "maximal-pi-smoke-"))
const key = randomUUID()
const configPath = join(root, "maximal-pi.json")
const environment = {
  PATH: process.env.PATH,
  HOME: root,
  USERPROFILE: root,
  APPDATA: join(root, "appdata"),
  LOCALAPPDATA: join(root, "localappdata"),
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_CACHE_HOME: join(root, "cache"),
  XDG_DATA_HOME: join(root, "data"),
  XDG_STATE_HOME: join(root, "state"),
  PI_CODING_AGENT_DIR: join(root, "agent"),
  PI_SKIP_VERSION_CHECK: "1",
  PI_TELEMETRY: "0",
  MAXIMAL_PI_CONFIG: configPath,
  MAXIMAL_PI_SMOKE_KEY: key,
  TERM: "dumb",
  NO_COLOR: "1",
}
const requests = []
let failed = false
let catalogFailure = false
let core

const entry = (provider, operations = ["messages"]) => ({
  source: "provider",
  provider,
  providerName: provider,
  id: "shared-model",
  name: `Fixture ${provider}`,
  basePath: `/${provider}/v1`,
  operations,
  contextWindowTokens: 32768,
  maxOutputTokens: 256,
  capabilities: { vision: false, tools: true, reasoning: false },
  targets: [],
})
const catalog = {
  data: [entry("perun"), entry("domovyk"), entry("classifier", ["systemone"])],
}
const encode = (type, data) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
const finish = (response, tool) => {
  response.write(
    encode("message_delta", {
      delta: {
        stop_reason: tool ? "tool_use" : "end_turn",
        stop_sequence: null,
      },
      usage: { output_tokens: 5 },
    }),
  )
  response.end(encode("message_stop", {}))
}

function startMessage(response) {
  response.writeHead(200, { "content-type": "text/event-stream" })
  response.write(
    encode("message_start", {
      message: {
        id: randomUUID(),
        type: "message",
        role: "assistant",
        model: "shared-model",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 7, output_tokens: 0 },
      },
    }),
  )
}

function assertInferenceKey(request) {
  assert(
    request.headers["x-api-key"] === key
      || request.headers.authorization === `Bearer ${key}`,
  )
}

const server = createServer(async (request, response) => {
  let stage = "route"
  try {
    requests.push({ method: request.method, path: request.url })
    if (
      request.method === "GET"
      && /^\/(?:perun|domovyk|classifier)\/v1\/models$/u.test(request.url)
    ) {
      assert.equal(request.headers.authorization, `Bearer ${key}`)
      const provider = request.url.split("/")[1]
      response.writeHead(catalogFailure ? 503 : 200, {
        "content-type": "application/json",
      })
      response.end(
        JSON.stringify({
          data: catalog.data
            .filter((model) => model.provider === provider)
            .map((model) => ({ id: model.id, display_name: model.name })),
        }),
      )
      return
    }
    assert.equal(request.method, "POST")
    const path = request.url?.split("?")[0]
    assert(["/domovyk/v1/messages", "/perun/v1/messages"].includes(path))
    stage = "inference-auth"
    assertInferenceKey(request)
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      assert(size < 1024 * 1024)
      chunks.push(chunk)
    }
    stage = "body"
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    assert.equal(body.model, "shared-model")
    assert.equal(body.stream, true)
    const tool =
      path === "/perun/v1/messages"
      && !body.messages.some(
        (message) =>
          Array.isArray(message.content)
          && message.content.some((block) => block.type === "tool_result"),
      )
    if (tool) {
      stage = "read-tool-definition"
      assert(body.tools?.some(({ name }) => name === "read"))
    }
    startMessage(response)
    if (tool) {
      response.write(
        encode("content_block_start", {
          index: 0,
          content_block: {
            type: "tool_use",
            id: "fixture-read",
            name: "read",
            input: {},
          },
        }),
      )
      response.write(
        encode("content_block_delta", {
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: JSON.stringify({ path: join(root, "fixture.txt") }),
          },
        }),
      )
    } else {
      response.write(
        encode("content_block_start", {
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      )
      response.write(
        encode("content_block_delta", {
          index: 0,
          delta: {
            type: "text_delta",
            text: `Maximal CLI ✓ ${request.url.startsWith("/perun/") ? "perun" : "domovyk"}`,
          },
        }),
      )
    }
    response.write(encode("content_block_stop", { index: 0 }))
    finish(response, tool)
  } catch {
    failed = true
    response.writeHead(500, { "content-type": "application/json" })
    response.end(
      JSON.stringify({ error: `fixture-contract-violation:${stage}` }),
    )
  }
})

try {
  await mkdir(environment.PI_CODING_AGENT_DIR, { mode: 0o700 })
  await writeFile(
    join(root, "fixture.txt"),
    "Synthetic fixture tool output.\n",
    { mode: 0o600 },
  )
  await new Promise((resolve) =>
    server.listen(0, new SocketAddress({ family: "ipv4" }).address, resolve),
  )
  const address = server.address()
  assert(address && typeof address === "object")
  core = await startCoreFixture(
    `http://${address.address}:${address.port}`,
    environment,
  )
  const origin = core.origin
  await writeFile(
    configPath,
    JSON.stringify({
      schemaVersion: 1,
      origin,
      apiKeyEnv: "MAXIMAL_PI_SMOKE_KEY",
      overrides: ["perun", "domovyk"].map((provider) => ({
        source: "provider",
        provider,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindowTokens: 32768,
        maxOutputTokens: 256,
      })),
    }),
    { mode: 0o600 },
  )
  const inspected = await execute(
    process.execPath,
    [
      fileURLToPath(new URL("../src/pi/cli.ts", import.meta.url)),
      "--config",
      configPath,
    ],
    { env: environment, cwd: root, timeout: 10_000 },
  )
  assert.equal(JSON.parse(inspected.stdout).providers.length, 2)
  const version = await execute(binary, ["--version"], {
    env: environment,
    cwd: root,
    timeout: 10_000,
  })
  const entryPoint = fileURLToPath(new URL("../dist/pi.js", import.meta.url))
  const flags = [
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-mcp",
    "--no-approve",
    "--no-session",
    "--extension",
    entryPoint,
  ]
  const run = (args) => {
    const result = execute(binary, [...flags, ...args], {
      env: environment,
      cwd: root,
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    // Print mode consumes piped stdin before dispatch; an open empty pipe is
    // not EOF. Close it explicitly rather than waiting for the child to exit.
    result.child.stdin?.end()
    return result
  }
  const listed = await run(["--list-models", "maximal"])
  assert(
    listed.stdout.includes("maximal-provider-perun"),
    `${listed.stdout}\n${listed.stderr}`.replaceAll(key, "[redacted]"),
  )
  assert(listed.stdout.includes("maximal-provider-domovyk"), listed.stderr)
  assert(!listed.stdout.includes("maximal-provider-classifier"))
  assert.equal(requests.filter(({ method }) => method === "POST").length, 0)
  const perun = await run([
    "--provider",
    "maximal-provider-perun",
    "--model",
    "shared-model",
    "--thinking",
    "off",
    "--tools",
    "read",
    "--print",
    "Return the fixed synthetic smoke marker using the fixture tool.",
  ])
  assert(perun.stdout.includes("Maximal CLI ✓ perun"), perun.stderr)
  const domovyk = await run([
    "--provider",
    "maximal-provider-domovyk",
    "--model",
    "shared-model",
    "--thinking",
    "off",
    "--no-tools",
    "--print",
    "Return the fixed synthetic smoke marker.",
  ])
  assert(domovyk.stdout.includes("Maximal CLI ✓ domovyk"), domovyk.stderr)
  for (const output of [listed, perun, domovyk])
    assert(!`${output.stdout}${output.stderr}`.includes(key))
  catalogFailure = true
  await core.stop()
  const unavailable = await run(["--list-models", "maximal"]).catch(
    (error) => error,
  )
  assert(!unavailable.stdout?.includes("maximal-provider-perun"))
  assert.equal(failed, false, "Synthetic peer rejected a Pi request")
  process.stdout.write(
    `Pi ${version.stdout.trim()}: live catalog discovery, duplicate-provider routing, Unicode text, streamed tool call/replay, and unavailable-catalog withdrawal passed through real Core and a synthetic inference upstream.\n`,
  )
} finally {
  await core?.stop()
  server.closeAllConnections()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  await rm(root, { recursive: true, force: true })
}
