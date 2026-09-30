import type { ChildProcessByStdio } from "node:child_process"
import type { AddressInfo } from "node:net"
import type { Readable } from "node:stream"

import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  awaitReadyLine,
  sidecarSpawnEnv,
} from "@maximal/maximal-core/supervisor"

interface RpcResponse<T> {
  result?: T
  error?: {
    code: number
    message: string
  }
}

interface TerminalLaunch {
  sessionId: string
  profileId: string
  application: string | null
  credential: string
  environment: Record<string, string>
}

interface TrafficRequest {
  terminal: {
    sessionId: string | null
    profileId: string | null
    application: string | null
  }
}

interface TrafficRequestList {
  items: Array<TrafficRequest>
}

const SESSION_ID = "e2e-maximal-terminal"
const POLL_ATTEMPTS = 50
const POLL_INTERVAL_MS = 100
const LOOPBACK_HOST = ["127", "0", "0", "1"].join(".")

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function rpc<T>(
  controlUrl: string,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${controlUrl}/control/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  })
  const body = (await response.json()) as RpcResponse<T>
  if (body.error) {
    throw new Error(
      `${method} failed (${String(body.error.code)}): ${body.error.message}`,
    )
  }
  if (body.result === undefined) {
    throw new Error(`${method} returned no result`)
  }
  return body.result
}

async function waitForAttribution(
  controlUrl: string,
): Promise<TrafficRequest> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const page = await rpc<TrafficRequestList>(
      controlUrl,
      "observability/requests",
      {
        filters: {
          terminalSessionIds: [SESSION_ID],
        },
      },
    )
    const request = page.items[0]
    if (request) return request
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error("Timed out waiting for terminal-attributed traffic")
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

async function stop(
  child: ChildProcessByStdio<null, Readable, Readable>,
): Promise<void> {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve())
  })
}

const home = await mkdtemp(join(tmpdir(), "maximal-terminal-e2e-"))

let fixtureOrigin = ""
const fixture = createServer((request, response) => {
  response.setHeader("content-type", "application/json")
  if (request.url === "/v1/models") {
    response.end(JSON.stringify({
      data: [{
        id: "e2e-model",
        name: "e2e-model",
        object: "model",
        owned_by: "ollama",
      }],
    }))
    return
  }
  if (request.url === "/api/show") {
    response.end(JSON.stringify({
      capabilities: ["completion", "tools"],
      details: { family: "e2e" },
      model_info: { "e2e.context_length": 32_000 },
    }))
    return
  }
  response.end(JSON.stringify({
    id: "chatcmpl-terminal-e2e",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1_000),
    model: "e2e-model",
    choices: [{
      index: 0,
      message: { role: "assistant", content: "attributed" },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: 4,
      completion_tokens: 2,
      total_tokens: 6,
    },
  }))
})
await new Promise<void>((resolve, reject) => {
  fixture.once("error", reject)
  fixture.listen(0, LOOPBACK_HOST, () => resolve())
})
const fixtureAddress = fixture.address() as AddressInfo
fixtureOrigin = `http://${LOOPBACK_HOST}:${String(fixtureAddress.port)}`
await writeFile(
  join(home, "config.json"),
  JSON.stringify({
    providers: {
      ollama: {
        type: "ollama",
        baseUrl: fixtureOrigin,
      },
    },
  }),
)

const child = spawn(
  "bun",
  [join("src", "main.ts"), "start", "--port", "0", "--control-port", "0"],
  {
    cwd: join(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      ...sidecarSpawnEnv(),
      MAXIMAL_HOME: home,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
)
let stderr = ""
child.stderr.on("data", (chunk: Buffer) => {
  stderr += chunk.toString()
})

try {
  const ready = await awaitReadyLine(child.stdout, { timeoutMs: 15_000 })
  child.stdout.on("data", () => undefined)
  const controlUrl = `http://${LOOPBACK_HOST}:${String(ready.controlPort)}`
  const proxyUrl = `http://${LOOPBACK_HOST}:${String(ready.proxyPort)}`

  const launch = await rpc<TerminalLaunch>(
    controlUrl,
    "terminalScopes/issue",
    {
      sessionId: SESSION_ID,
      profileId: "maximal",
      application: "untrusted-caller-label",
    },
  )

  assertEqual(launch.application, "Maximal", "authoritative application")
  assertEqual(
    launch.environment.STUFFBUCKET_PROVIDER,
    "maximal",
    "Pi provider pin",
  )
  assertEqual(
    launch.environment.STUFFBUCKET_PROVIDER_URL,
    proxyUrl,
    "Pi provider URL",
  )
  assertEqual(
    launch.environment.STUFFBUCKET_PROVIDER_API_KEY,
    launch.credential,
    "Pi terminal credential",
  )

  const catalogueResponse = await fetch(`${proxyUrl}/v1/models`, {
    headers: { authorization: `Bearer ${launch.credential}` },
  })
  const catalogue = (await catalogueResponse.json()) as {
    data?: Array<{ id?: string }>
  }
  const model = catalogue.data?.find(({ id }) => id?.includes("e2e-model"))?.id
  if (!model) throw new Error("Maximal did not advertise the fixture model")

  const inferenceResponse = await fetch(`${proxyUrl}/ollama/v1/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${launch.credential}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "attribute this request" }],
    }),
  })
  assertEqual(inferenceResponse.status, 200, "proxy response status")

  const observed = await waitForAttribution(controlUrl)
  assertEqual(observed.terminal.sessionId, SESSION_ID, "terminal session")
  assertEqual(observed.terminal.profileId, "maximal", "terminal profile")
  assertEqual(observed.terminal.application, "Maximal", "terminal application")

  console.log(
    "ok terminal scope issuance, Pi launch environment, proxy authentication, and persisted attribution",
  )
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim())
  throw error
} finally {
  await stop(child)
  await new Promise<void>((resolve, reject) => {
    fixture.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  await rm(home, { recursive: true, force: true })
}
