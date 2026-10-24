/** Real Core process for the Pi CLI smoke; only the inference upstream is synthetic. */
import type { ProviderGateway, ProviderStatus } from "@maximal/maximal-model-contract"

import { SocketAddress } from "node:net"

import { TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT } from "~/lib/observability/process-protocol"

async function main(): Promise<void> {
  const [{ createServerApps }, { closeTrafficStore }] = await Promise.all([
    import("~/server"),
    import("~/lib/observability/store"),
  ])
  const value = process.env.MAXIMAL_PI_FIXTURE_UPSTREAM
  const key = process.env.MAXIMAL_PI_SMOKE_KEY
  if (!value || !key) throw new Error("Pi fixture requires a held upstream origin and synthetic key.")
  let origin: URL
  try {
    origin = new URL(value)
    if (origin.protocol !== "http:" || origin.hostname !== new SocketAddress({ family: "ipv4" }).address || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash) throw new Error()
  } catch {
    throw new Error("Pi fixture requires a literal loopback upstream origin.")
  }
  const statuses: ReadonlyArray<ProviderStatus> = ["perun", "domovyk", "classifier"].map((provider) => ({
    provider, state: "available", diagnostics: [],
    operations: provider === "classifier" ? ["models", "systemone"] : ["models", "messages"],
  }))
  const noop = (): void => undefined
  const gateway: ProviderGateway = {
    dispatch: async ({ operation, provider, request, signal }) => {
      if (!statuses.some((status) => status.provider === provider) || (operation !== "models" && operation !== "messages")) {
        return Response.json({ error: "Unsupported synthetic fixture operation" }, { status: 404 })
      }
      const path = operation === "models" ? "models" : "messages"
      return fetch(new URL(`/${provider}/v1/${path}`, origin), {
        method: operation === "models" ? "GET" : "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        ...(operation === "messages" ? { body: await request.clone().text() } : {}),
        redirect: "error", signal,
      })
    },
    dispose: () => Promise.resolve(),
    getStatus: (provider) => statuses.find((status) => status.provider === provider),
    listStatuses: () => statuses,
    subscribe: () => noop,
  }
  const apps = createServerApps({ providerGateway: gateway, readConfig: () => ({ providerHost: { mode: "plugins" } }) })
  const server = Bun.serve({ hostname: origin.hostname, port: 0, fetch: apps.publicApp.fetch })
  process.stdout.write(`${JSON.stringify({ kind: "pi-fixture-ready", origin: server.url.origin })}\n`)
  let stopping = false
  async function stop(): Promise<void> {
    if (stopping) return
    stopping = true
    await server.stop(true)
    await apps.providerDispatcher.dispose()
    await closeTrafficStore()
  }
  process.on("SIGTERM", () => { void stop() })
  process.on("SIGINT", () => { void stop() })
}

// Core's observability worker reuses the executable's entry point. Handle its
// private child mode before importing/starting another proxy or leaking a worker.
if (process.argv[2] === TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT) {
  const { runTrafficObservabilityChild } = await import("~/lib/observability/process-host")
  await runTrafficObservabilityChild()
} else {
  await main()
}
