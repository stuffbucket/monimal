import { describe, expect, it } from "bun:test"

import type { RuntimeIdentity } from "~/lib/host-config/types"

import { probeRuntimeIdentity } from "~/lib/host-config/runtime-identity"

const expected: RuntimeIdentity = {
  nonce: "boot-nonce",
  pid: 123,
  proxyPort: 41_501,
  controlPort: 42_501,
  startedAt: "2026-01-01T00:00:00.000Z",
}

function discovery(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    jsonrpc: "2.0",
    id: "maximal-configurator-owner-probe",
    result: {
      identity: {
        instanceId: expected.nonce,
        pid: expected.pid,
        startedAt: expected.startedAt,
      },
      ports: {
        proxy: expected.proxyPort,
        control: expected.controlPort,
      },
      ...overrides,
    },
  })
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

describe("runtime identity probe", () => {
  it("accepts only an exact discovery identity on the recorded control port", async () => {
    let requestedUrl = ""
    const matched = await probeRuntimeIdentity(expected, (input) => {
      requestedUrl = requestUrl(input)
      return Promise.resolve(discovery())
    })

    expect(matched).toBe(true)
    expect(requestedUrl).toBe("http://127.0.0.1:42501/control/rpc")
  })

  it("rejects a reused port whose boot nonce differs", async () => {
    const matched = await probeRuntimeIdentity(expected, () =>
      Promise.resolve(
        discovery({
          identity: {
            instanceId: "another-boot",
            pid: expected.pid,
            startedAt: expected.startedAt,
          },
        }),
      ),
    )
    expect(matched).toBe(false)
  })

  it("fails closed for unavailable or invalid control ports", async () => {
    const unavailable = await probeRuntimeIdentity(expected, () =>
      Promise.reject(new Error("connection refused")),
    )
    expect(unavailable).toBe(false)

    let called = false
    const invalid = await probeRuntimeIdentity(
      { ...expected, controlPort: 0 },
      () => {
        called = true
        return Promise.resolve(discovery())
      },
    )
    expect(invalid).toBe(false)
    expect(called).toBe(false)
  })
})
