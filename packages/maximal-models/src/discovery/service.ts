import type {
  ModelDiscoveryAction,
  ModelDiscoveryFactoryContext,
  ModelDiscoveryNetworkScope,
  ModelDiscoveryService,
  ModelDiscoverySnapshot,
  ModelExecutionTarget,
} from "@maximal/maximal-model-contract"

import {
  MODEL_DISCOVERY_SCHEMA_VERSION,
  assertCredentialFreeEndpoint,
} from "@maximal/maximal-model-contract"
import { LOOPBACK_IPV4_HOSTNAME } from "@maximal/maximal-provider-decision-model"
import { randomUUID } from "node:crypto"

import {
  boundedNetworkScope,
  localNetworkScopes,
  scopeAddresses,
} from "./network.ts"
import {
  MODEL_DISCOVERY_DEFAULT_PORTS,
  probeModels,
  type DiscoveryProbe,
} from "./probe.ts"

function jobStopped(job: Job): boolean {
  return job.snapshot.state !== "running" || job.controller.signal.aborted
}

interface Job {
  readonly controller: AbortController
  snapshot: ModelDiscoverySnapshot
}

export interface ModelDiscoveryOptions {
  readonly networkScopes?: () => Promise<
    ReadonlyArray<ModelDiscoveryNetworkScope>
  >
  readonly fetchImplementation?: typeof fetch
  readonly now?: () => number
  readonly defaultPorts?: ReadonlyArray<number>
  readonly concurrency?: number
  readonly probeTimeoutMs?: number
  readonly scanTimeoutMs?: number
}

function snapshot(value: ModelDiscoverySnapshot): ModelDiscoverySnapshot {
  return Object.freeze({
    ...value,
    networkScopes: Object.freeze(
      value.networkScopes.map((scope) => Object.freeze({ ...scope })),
    ),
    endpoints: Object.freeze(
      value.endpoints.map((endpoint) =>
        Object.freeze({
          ...endpoint,
          models: Object.freeze(
            endpoint.models.map((model) => Object.freeze({ ...model })),
          ),
        }),
      ),
    ),
  })
}

function boundedPolicy(options: ModelDiscoveryOptions) {
  const policy = {
    ports: options.defaultPorts ?? MODEL_DISCOVERY_DEFAULT_PORTS,
    concurrency: options.concurrency ?? 8,
    probeTimeoutMs: options.probeTimeoutMs ?? 1_000,
    scanTimeoutMs: options.scanTimeoutMs ?? 15_000,
  }
  if (
    !Number.isInteger(policy.concurrency)
    || policy.concurrency < 1
    || policy.concurrency > 16
    || policy.ports.length > 8
    || policy.ports.some(
      (port) => !Number.isInteger(port) || port < 1 || port > 65535,
    )
  )
    throw new TypeError("Invalid bounded discovery policy.")
  if (
    !Number.isInteger(policy.probeTimeoutMs)
    || policy.probeTimeoutMs < 1
    || policy.probeTimeoutMs > 5_000
    || !Number.isInteger(policy.scanTimeoutMs)
    || policy.scanTimeoutMs < 1
    || policy.scanTimeoutMs > 60_000
  )
    throw new TypeError("Invalid bounded discovery time budget.")
  return policy
}

function endpointOrigin(target: ModelExecutionTarget): string | undefined {
  try {
    assertCredentialFreeEndpoint(target.endpoint)
    if (!target.endpoint.url) return undefined
    const url = new URL(target.endpoint.url)
    if (
      !["http:", "https:"].includes(url.protocol)
      || url.pathname !== "/"
      || url.search
      || url.hash
    )
      return undefined
    return url.origin
  } catch {
    return undefined
  }
}

function addProbe(
  probes: Map<string, DiscoveryProbe>,
  candidate: { url: string; scope: "device" | "lan" },
  inventory: {
    targets: ReadonlyArray<ModelExecutionTarget>
    addresses: ReadonlyArray<string>
  },
): void {
  const url = new URL(candidate.url)
  if (candidate.scope === "device" && url.hostname !== LOOPBACK_IPV4_HOSTNAME)
    return
  if (candidate.scope === "lan" && !inventory.addresses.includes(url.hostname))
    return
  probes.set(url.origin, {
    url: url.origin,
    scope: candidate.scope,
    targets: inventory.targets.filter(
      (target) => endpointOrigin(target) === url.origin,
    ),
  })
}

class DiscoveryService implements ModelDiscoveryService {
  readonly #context: ModelDiscoveryFactoryContext
  readonly #options: ModelDiscoveryOptions
  readonly #policy: ReturnType<typeof boundedPolicy>
  readonly #jobs = new Map<string, Job>()
  #disposed = false

  constructor(
    context: ModelDiscoveryFactoryContext,
    options: ModelDiscoveryOptions,
  ) {
    this.#context = context
    this.#options = options
    this.#policy = boundedPolicy(options)
  }

  async act(request: ModelDiscoveryAction): Promise<ModelDiscoverySnapshot> {
    if (this.#disposed) throw new Error("Model discovery is stopped.")
    switch (request.action) {
      case "describe": {
        return this.#describe()
      }
      case "start": {
        return this.#start(request)
      }
      case "read": {
        return this.#read(request.id, false)
      }
      case "cancel": {
        return this.#read(request.id, true)
      }
      default: {
        throw new Error("Unsupported discovery action.")
      }
    }
  }

  dispose(): void {
    this.#disposed = true
    for (const job of this.#jobs.values())
      this.#cancel(job, "Discovery stopped with the sidecar.")
  }

  async #describe(): Promise<ModelDiscoverySnapshot> {
    const scopes = await (this.#options.networkScopes ?? localNetworkScopes)()
    const checked = scopes
      .flatMap((scope) => {
        const bounded = boundedNetworkScope(scope.interfaceName, scope.cidr)
        return (
            bounded?.id === scope.id && bounded.hostCount === scope.hostCount
          ) ?
            [bounded]
          : []
      })
      .slice(0, 8)
    return snapshot({
      schemaVersion: MODEL_DISCOVERY_SCHEMA_VERSION,
      id: null,
      revision: 0,
      state: "idle",
      includeLocalNetwork: false,
      networkScopes: checked,
      endpoints: [],
      completedProbes: 0,
      totalProbes: 0,
      truncated: false,
      message:
        checked.length === 0 ?
          "No safely bounded local-network interface is available. This-device discovery remains available."
        : null,
    })
  }

  #candidates(
    scopes: ReadonlyArray<ModelDiscoveryNetworkScope>,
    includeNetwork: boolean,
  ): ReadonlyArray<DiscoveryProbe> {
    const addresses = [
      ...new Set(scopes.flatMap((scope) => scopeAddresses(scope))),
    ]
    if (addresses.length > 256)
      throw new Error(
        "The selected networks exceed the 256-host discovery limit.",
      )
    const inventory = { targets: this.#context.configuredTargets(), addresses }
    const probes = new Map<string, DiscoveryProbe>()
    for (const port of this.#policy.ports)
      addProbe(
        probes,
        { url: `http://${LOOPBACK_IPV4_HOSTNAME}:${port}`, scope: "device" },
        inventory,
      )
    if (includeNetwork)
      for (const address of addresses)
        for (const port of this.#policy.ports)
          addProbe(
            probes,
            { url: `http://${address}:${port}`, scope: "lan" },
            inventory,
          )
    for (const target of inventory.targets) {
      const origin = endpointOrigin(target)
      if (!origin || target.location === "cloud") continue
      // Probe scope follows the transport address, never the execution claim.
      if (new URL(origin).hostname === LOOPBACK_IPV4_HOSTNAME)
        addProbe(probes, { url: origin, scope: "device" }, inventory)
      else if (includeNetwork)
        addProbe(probes, { url: origin, scope: "lan" }, inventory)
    }
    if (probes.size > 2048)
      throw new Error(
        "The endpoint inventory exceeds the bounded discovery budget.",
      )
    return [...probes.values()]
  }

  async #start(
    request: Extract<ModelDiscoveryAction, { action: "start" }>,
  ): Promise<ModelDiscoverySnapshot> {
    const description = await this.#describe()
    if (this.#disposed) throw new Error("Model discovery is stopped.")
    // Check after scope enumeration: concurrent starts must share the job cap.
    if (
      [...this.#jobs.values()].filter((job) => job.snapshot.state === "running")
        .length >= 2
    )
      throw new Error(
        "Two discovery sessions are already running. Cancel one before starting another.",
      )
    if (!request.includeLocalNetwork && request.networkScopeIds.length > 0)
      throw new Error("Local-network discovery requires explicit consent.")
    const approved = description.networkScopes.filter(({ id }) =>
      request.networkScopeIds.includes(id),
    )
    if (
      approved.length !== request.networkScopeIds.length
      || (request.includeLocalNetwork && approved.length === 0)
    )
      throw new Error(
        "The local network scope changed or is unavailable. Refresh before scanning.",
      )
    const probes = this.#candidates(approved, request.includeLocalNetwork)
    for (const [id, job] of this.#jobs) {
      if (this.#jobs.size < 8) break
      if (job.snapshot.state !== "running") this.#jobs.delete(id)
    }
    const id = randomUUID()
    const job: Job = {
      controller: new AbortController(),
      snapshot: snapshot({
        ...description,
        id,
        state: "running",
        revision: 1,
        includeLocalNetwork: request.includeLocalNetwork,
        networkScopes: approved,
        totalProbes: probes.length,
      }),
    }
    this.#jobs.set(id, job)
    void this.#run(job, probes)
    return job.snapshot
  }

  #read(id: string, cancel: boolean): ModelDiscoverySnapshot {
    const job = this.#jobs.get(id)
    if (!job)
      throw new Error(
        "This discovery session is no longer available. Start a new scan.",
      )
    if (cancel)
      this.#cancel(
        job,
        "Discovery cancelled. Existing models and connections are unchanged.",
      )
    return job.snapshot
  }

  #cancel(job: Job, message: string): void {
    if (job.snapshot.state !== "running") return
    job.snapshot = snapshot({
      ...job.snapshot,
      state: "cancelled",
      revision: job.snapshot.revision + 1,
      message,
    })
    job.controller.abort("discovery cancelled")
  }

  async #worker(
    job: Job,
    nextProbe: () => DiscoveryProbe | undefined,
  ): Promise<void> {
    while (!job.controller.signal.aborted) {
      const probe = nextProbe()
      if (!probe) return
      const signal = AbortSignal.any([
        job.controller.signal,
        AbortSignal.timeout(this.#policy.probeTimeoutMs),
      ])
      const endpoint = await probeModels(probe, {
        signal,
        fetchImplementation: this.#options.fetchImplementation ?? fetch,
        now: this.#options.now ?? Date.now,
      })
      if (jobStopped(job)) return
      job.snapshot = snapshot({
        ...job.snapshot,
        endpoints:
          endpoint ?
            [...job.snapshot.endpoints, endpoint]
          : job.snapshot.endpoints,
        completedProbes: job.snapshot.completedProbes + 1,
        revision: job.snapshot.revision + 1,
      })
      if (job.snapshot.endpoints.length >= 64) {
        job.controller.abort("discovery result limit reached")
        return
      }
    }
  }

  async #run(job: Job, probes: ReadonlyArray<DiscoveryProbe>): Promise<void> {
    let index = 0
    const timer = setTimeout(
      () => job.controller.abort("discovery budget exhausted"),
      this.#policy.scanTimeoutMs,
    )
    try {
      await Promise.all(
        Array.from({ length: this.#policy.concurrency }, () =>
          this.#worker(job, () => probes[index++]),
        ),
      )
      if (job.snapshot.state === "running")
        job.snapshot = snapshot({
          ...job.snapshot,
          state: "completed",
          revision: job.snapshot.revision + 1,
          truncated:
            job.controller.signal.aborted
            || job.snapshot.completedProbes < probes.length,
          message:
            job.controller.signal.aborted ?
              "Discovery reached its budget. Results are partial; refresh or enter an endpoint manually."
            : null,
        })
    } catch {
      if (job.snapshot.state === "running")
        job.snapshot = snapshot({
          ...job.snapshot,
          state: "failed",
          revision: job.snapshot.revision + 1,
          message: "Discovery failed. Retry or enter an endpoint manually.",
        })
    } finally {
      clearTimeout(timer)
      job.controller.abort("discovery ended")
    }
  }
}

/** Bounded metadata-only discovery, independent of provider activation and sign-in. */
export function createModelDiscoveryService(
  context: ModelDiscoveryFactoryContext,
  options: ModelDiscoveryOptions = {},
): ModelDiscoveryService {
  return new DiscoveryService(context, options)
}
