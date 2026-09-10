import { afterEach, beforeEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { RuntimeIdentity } from "~/lib/host-config/types"

import { ControlClient } from "~/lib/live/client"
import {
  clearRuntimeEndpoint,
  connectToLiveControl,
  readRuntimeEndpoint,
  writeRuntimeEndpoint,
} from "~/lib/live/runtime-endpoint"

const runtime: RuntimeIdentity = {
  nonce: "runtime-one",
  pid: 1234,
  proxyPort: 41501,
  controlPort: 41502,
  startedAt: "2026-09-10T12:00:00.000Z",
}

let directory: string
let descriptorPath: string

beforeEach(() => {
  directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "maximal-runtime-endpoint-"),
  )
  descriptorPath = path.join(directory, "runtime.json")
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

test("publishes owner-only runtime evidence and reads it back", () => {
  writeRuntimeEndpoint(runtime, descriptorPath)

  expect(readRuntimeEndpoint(descriptorPath)).toEqual(runtime)
  if (process.platform !== "win32") {
    expect(fs.statSync(descriptorPath).mode & 0o777).toBe(0o600)
  }
})

test("clears only the descriptor written by the expected runtime", () => {
  writeRuntimeEndpoint(runtime, descriptorPath)
  clearRuntimeEndpoint({ ...runtime, nonce: "replacement" }, descriptorPath)
  expect(readRuntimeEndpoint(descriptorPath)).toEqual(runtime)

  clearRuntimeEndpoint(runtime, descriptorPath)
  expect(fs.existsSync(descriptorPath)).toBe(false)
})

test("rejects invalid or stale runtime evidence before creating a client", async () => {
  let clients = 0
  const createClient = (): ControlClient => {
    clients++
    return new ControlClient({ baseUrl: "http://127.0.0.1:41502" })
  }

  expect(
    await connectToLiveControl({
      readRuntime: () => runtime,
      probeRuntime: () => Promise.resolve(false),
      createClient,
    }),
  ).toBeNull()
  expect(clients).toBe(0)

  const client = await connectToLiveControl({
    readRuntime: () => runtime,
    probeRuntime: () => Promise.resolve(true),
    createClient,
  })
  expect(client).toBeInstanceOf(ControlClient)
  expect(clients).toBe(1)
})
