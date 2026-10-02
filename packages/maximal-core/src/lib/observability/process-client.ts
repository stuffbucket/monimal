import type {
  TrafficCompletionObservation,
  TrafficContextObservation,
  TrafficDispatchObservation,
  TrafficFirstResponseObservation,
  TrafficInvalidationListener,
  TrafficObservationHandle,
  TrafficObservationStart,
  TrafficObserver,
  TrafficOverview,
  TrafficOverviewQuery,
  TrafficRequestDetail,
  TrafficRequestList,
  TrafficRequestListQuery,
  TrafficSessionObservation,
  TrafficTokenObservation,
} from "@maximal/maximal-observability-contract"

import {
  TrafficOverviewSchema,
  TrafficRequestDetailSchema,
  TrafficRequestListSchema,
} from "@maximal/maximal-observability-contract"
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { z } from "zod"

import type {
  PersistedTokenUsageEvent,
  TokenUsageEventsPage,
  TokenUsagePeriod,
  TokenUsageSeries,
  TokenUsageSummary,
  TokenUsageStoreDelegate,
} from "~/lib/token-usage/store"

import {
  TokenUsageEventsPageSchema,
  TokenUsageSeriesSchema,
  TokenUsageSummarySchema,
  TrafficProcessChildMessageSchema,
  type TrafficProcessChildMessage,
  type TrafficProcessObservationEvent,
  type TrafficProcessParentMessage,
  type TrafficProcessQuery,
} from "~/lib/observability/process-protocol"
import {
  trafficChildInvocation,
  type TrafficChildInvocation,
} from "~/lib/observability/self-launch"
import { runtimeLogger } from "~/lib/platform/runtime-logger"

const OBSERVATION_BATCH_SIZE = 64
const MAX_QUEUED_OBSERVATIONS = 4096
const STARTUP_TIMEOUT_MS = 10_000
const COMMAND_TIMEOUT_MS = 30_000
const nonnegativeIntegerSchema = z.number().int().nonnegative()

interface PendingCommand {
  readonly id: string
  readonly message: TrafficProcessParentMessage
  readonly reject?: (error: Error) => void
  readonly resolve?: (value: unknown) => void
  timer?: ReturnType<typeof setTimeout>
}

type TrafficProcessCommandResponse = Extract<
  TrafficProcessChildMessage,
  { kind: "acknowledged" | "result" }
>

export interface TrafficProcessClientOptions {
  readonly databasePath: string
  readonly retentionDays?: number
  readonly onInvalidation?: TrafficInvalidationListener
  readonly invocation?: TrafficChildInvocation
  readonly spawnChild?: (
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptions,
  ) => ChildProcess
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function commandError(message: string): Error {
  return new Error(`Traffic observability process: ${message}`)
}

function spawnTrafficChild(
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions,
): ChildProcess {
  return spawn(command, [...args], options)
}

export class TrafficProcessClient
  implements TrafficObserver, TokenUsageStoreDelegate
{
  private child: ChildProcess | undefined
  private closing = false
  private commandId = 0
  private readonly commands: Array<PendingCommand> = []
  private generation = 0
  private inFlight: PendingCommand | undefined
  private observationBatchScheduled = false
  private readonly observationBuffer: Array<TrafficProcessObservationEvent> = []
  private observationOverflowReported = false
  private queuedObservationCount = 0
  private ready = false
  private readonly options: TrafficProcessClientOptions
  private startupTimer: ReturnType<typeof setTimeout> | undefined

  constructor(options: TrafficProcessClientOptions) {
    this.options = options
  }

  beginRequest(start: TrafficObservationStart): TrafficObservationHandle {
    this.ensureChild()
    const generation = this.generation
    const requestId = start.identity.requestId
    const enabled =
      this.child !== undefined
      && this.enqueueObservation({ kind: "begin", observation: start })
    return new TrafficProcessObservationHandle(
      requestId,
      (event) => {
        if (enabled && generation === this.generation)
          this.enqueueObservation(event)
      },
      enabled,
    )
  }

  async listRequests(
    query: TrafficRequestListQuery,
  ): Promise<TrafficRequestList> {
    const value = await this.query({
      method: "list-requests",
      query,
    })
    return TrafficRequestListSchema.parse(value)
  }

  async getRequest(requestId: string): Promise<TrafficRequestDetail | null> {
    const value = await this.query({ method: "get-request", requestId })
    return TrafficRequestDetailSchema.nullable().parse(value)
  }

  async getOverview(query: TrafficOverviewQuery): Promise<TrafficOverview> {
    const value = await this.query({ method: "get-overview", query })
    return TrafficOverviewSchema.parse(value)
  }

  enqueueTokenUsageWrite(event: PersistedTokenUsageEvent): void {
    this.ensureChild()
    if (this.child) this.enqueueObservation({ kind: "token-usage", event })
  }

  async flushTokenUsageEvents(): Promise<void> {
    await this.query({ method: "flush-token-usage" })
  }

  async pruneTokenUsageEvents(beforeMs: number): Promise<number> {
    const value = await this.query({ method: "prune-token-usage", beforeMs })
    return nonnegativeIntegerSchema.parse(value)
  }

  async getTokenUsageSummary(
    period: TokenUsagePeriod,
  ): Promise<TokenUsageSummary> {
    const value = await this.query({
      method: "get-token-usage-summary",
      period,
    })
    return TokenUsageSummarySchema.parse(value)
  }

  async getTokenUsageEventsPage(input: {
    page: number
    pageSize: number
    period: TokenUsagePeriod
  }): Promise<TokenUsageEventsPage> {
    const value = await this.query({
      method: "get-token-usage-events",
      ...input,
    })
    return TokenUsageEventsPageSchema.parse(value)
  }

  async getTokenUsageSeries(input: {
    period: TokenUsagePeriod
    bucketMs?: number
  }): Promise<TokenUsageSeries> {
    const value = await this.query({
      method: "get-token-usage-series",
      ...input,
    })
    return TokenUsageSeriesSchema.parse(value)
  }

  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    this.flushObservationBuffer()
    const child = this.child
    if (!child) {
      this.rejectCommands(commandError("closed before startup"))
      return
    }

    try {
      await this.enqueueQueryCommand({
        kind: "close",
        id: this.nextCommandId(),
      })
    } finally {
      if (this.child === child && child.connected) child.disconnect()
      this.child = undefined
      this.ready = false
    }
  }

  private query(query: TrafficProcessQuery): Promise<unknown> {
    if (this.closing)
      return Promise.reject(commandError("query attempted after close"))
    this.ensureChild()
    if (!this.child)
      return Promise.reject(commandError("failed to start child process"))
    this.flushObservationBuffer()
    return this.enqueueQueryCommand({
      kind: "query",
      id: this.nextCommandId(),
      query,
    })
  }

  private enqueueQueryCommand(
    message: Extract<TrafficProcessParentMessage, { kind: "query" | "close" }>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.commands.push({ id: message.id, message, resolve, reject })
      this.drainCommands()
    })
  }

  private enqueueObservation(event: TrafficProcessObservationEvent): boolean {
    if (this.closing) return false
    if (
      this.queuedObservationCount >= MAX_QUEUED_OBSERVATIONS
      && event.kind !== "complete"
    ) {
      if (!this.observationOverflowReported) {
        this.observationOverflowReported = true
        runtimeLogger.warn(
          "Traffic observability queue is full; dropping passive updates",
        )
      }
      return false
    }
    this.observationBuffer.push(event)
    this.queuedObservationCount += 1
    if (!this.observationBatchScheduled) {
      this.observationBatchScheduled = true
      queueMicrotask(() => {
        this.observationBatchScheduled = false
        this.flushObservationBuffer()
      })
    }
    return true
  }

  private flushObservationBuffer(): void {
    while (this.observationBuffer.length > 0) {
      const events = this.observationBuffer.splice(0, OBSERVATION_BATCH_SIZE)
      const id = this.nextCommandId()
      this.commands.push({
        id,
        message: { kind: "observe", id, events },
      })
    }
    this.drainCommands()
  }

  private ensureChild(): void {
    if (this.child || this.closing) return
    const invocation = this.options.invocation ?? trafficChildInvocation()
    let child: ChildProcess
    try {
      child = (this.options.spawnChild ?? spawnTrafficChild)(
        invocation.command,
        invocation.args,
        {
          env: process.env,
          stdio: ["ignore", "ignore", "inherit", "ipc"],
        },
      )
    } catch (error) {
      runtimeLogger.error(
        "Failed to spawn traffic observability process",
        errorMessage(error),
      )
      return
    }

    this.child = child
    this.generation += 1
    this.ready = false
    child.on("message", (value) => this.handleChildMessage(child, value))
    child.once("error", (error) => this.failChild(child, error))
    child.once("exit", (code, signal) => {
      this.failChild(
        child,
        commandError(
          `exited before shutdown (code ${String(code)}, signal ${String(signal)})`,
        ),
      )
    })
    this.startupTimer = setTimeout(() => {
      this.failChild(child, commandError("startup timed out"))
      child.kill()
    }, STARTUP_TIMEOUT_MS)
    this.startupTimer.unref()

    this.send(child, {
      kind: "initialize",
      databasePath: this.options.databasePath,
      retentionDays: this.options.retentionDays ?? 365,
    })
  }

  private send(
    child: ChildProcess,
    message: TrafficProcessParentMessage,
  ): void {
    if (!child.connected) {
      this.failChild(child, commandError("IPC channel is unavailable"))
      return
    }
    try {
      child.send(message, (error) => {
        if (error) this.failChild(child, error)
      })
    } catch (error) {
      this.failChild(child, error)
    }
  }

  private handleChildMessage(child: ChildProcess, value: unknown): void {
    if (child !== this.child) return
    const parsed = TrafficProcessChildMessageSchema.safeParse(value)
    if (!parsed.success) {
      this.failChild(
        child,
        commandError(`received invalid IPC: ${parsed.error.message}`),
      )
      child.kill()
      return
    }

    const message = parsed.data
    if (message.kind === "ready") {
      if (this.ready) {
        this.failChild(child, commandError("sent duplicate ready message"))
        child.kill()
        return
      }
      this.ready = true
      this.clearStartupTimer()
      this.drainCommands()
      return
    }
    if (message.kind === "invalidation") {
      try {
        this.options.onInvalidation?.(message.invalidation)
      } catch (error) {
        runtimeLogger.warn("Traffic invalidation listener failed", error)
      }
      return
    }
    if (message.kind === "fatal") {
      this.failChild(child, commandError(message.error.message))
      child.kill()
      return
    }
    this.handleCommandResponse(child, message)
  }

  private handleCommandResponse(
    child: ChildProcess,
    message: TrafficProcessCommandResponse,
  ): void {
    const command = this.inFlight
    if (!command || command.id !== message.id) {
      this.failChild(
        child,
        commandError(`received unexpected result ${message.id}`),
      )
      child.kill()
      return
    }
    this.clearCommandTimer(command)
    this.inFlight = undefined

    if (message.kind === "acknowledged") {
      if (command.message.kind === "observe") {
        this.queuedObservationCount -= command.message.events.length
        if (this.queuedObservationCount < MAX_QUEUED_OBSERVATIONS / 2)
          this.observationOverflowReported = false
      }
      command.resolve?.(undefined)
    } else if (message.ok) {
      command.resolve?.(message.value)
    } else {
      command.reject?.(commandError(message.error.message))
    }
    this.drainCommands()
  }

  private drainCommands(): void {
    const child = this.child
    if (!child || !this.ready || this.inFlight) return
    const command = this.commands.shift()
    if (!command) return
    this.inFlight = command
    command.timer = setTimeout(() => {
      this.failChild(child, commandError(`command ${command.id} timed out`))
      child.kill()
    }, COMMAND_TIMEOUT_MS)
    command.timer.unref()
    this.send(child, command.message)
  }

  private failChild(child: ChildProcess, cause: unknown): void {
    if (child !== this.child) return
    this.child = undefined
    this.ready = false
    this.generation += 1
    this.clearStartupTimer()
    runtimeLogger.error(
      "Traffic observability process unavailable",
      errorMessage(cause),
    )
    this.rejectCommands(commandError(errorMessage(cause)))
  }

  private rejectCommands(error: Error): void {
    const pending = [
      ...(this.inFlight ? [this.inFlight] : []),
      ...this.commands.splice(0),
    ]
    this.inFlight = undefined
    this.observationBuffer.length = 0
    this.queuedObservationCount = 0
    this.observationOverflowReported = false
    for (const command of pending) {
      this.clearCommandTimer(command)
      command.reject?.(error)
    }
  }

  private nextCommandId(): string {
    this.commandId += 1
    return String(this.commandId)
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.startupTimer = undefined
  }

  private clearCommandTimer(command: PendingCommand): void {
    if (command.timer) clearTimeout(command.timer)
    command.timer = undefined
  }
}

class TrafficProcessObservationHandle implements TrafficObservationHandle {
  private readonly emit: (event: TrafficProcessObservationEvent) => void
  private readonly requestId: string
  private terminal: boolean

  constructor(
    requestId: string,
    emit: (event: TrafficProcessObservationEvent) => void,
    enabled: boolean,
  ) {
    this.requestId = requestId
    this.emit = emit
    this.terminal = !enabled
  }

  recordDispatch(observation: TrafficDispatchObservation): void {
    this.emitActive({
      kind: "dispatch",
      requestId: this.requestId,
      observation,
    })
  }

  recordFirstResponse(observation: TrafficFirstResponseObservation): void {
    this.emitActive({
      kind: "first-response",
      requestId: this.requestId,
      observation,
    })
  }

  recordContext(observation: TrafficContextObservation): void {
    this.emitActive({
      kind: "context",
      requestId: this.requestId,
      observation,
    })
  }

  recordSession(observation: TrafficSessionObservation): void {
    this.emitActive({
      kind: "session",
      requestId: this.requestId,
      observation,
    })
  }

  recordTokens(observation: TrafficTokenObservation): void {
    this.emitActive({ kind: "tokens", requestId: this.requestId, observation })
  }

  complete(observation: TrafficCompletionObservation): void {
    if (this.terminal) return
    this.terminal = true
    this.emit({
      kind: "complete",
      requestId: this.requestId,
      observation,
    })
  }

  private emitActive(event: TrafficProcessObservationEvent): void {
    if (!this.terminal) this.emit(event)
  }
}
