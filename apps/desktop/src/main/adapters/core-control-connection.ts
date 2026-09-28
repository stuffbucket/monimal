import type { ChildProcess } from 'node:child_process'

import {
  ControlRpcError,
  type ControlState,
} from '@maximal/maximal-core/client'
import {
  CONTROL_ERROR_REASONS,
  type LocalModelOperationEvent,
} from '@maximal/maximal-core-contract/control'
import {
  SUPPORTED_PROTOCOL_VERSION,
  type ControlTopic,
} from '@maximal/maximal-core/contract'
import {
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
  TrafficInvalidationSchema,
  type TrafficInvalidation,
} from '@maximal/maximal-observability-contract'
import { z } from 'zod'

import { awaitCoreProcess, controlClientFor, onCoreStatus, type CoreStatus } from '../sidecar/core'
import { mainLogger } from '../main-logger'
import type {
  ControlFailure,
  ControlResult,
} from '@maximal/maximal-client/shared/host'
import {
  createCoreControlOperations,
  localModelOperationEventSchema,
  requiredMethods,
  type ControlMethod,
  type CoreControlOperations,
} from './core-control-operations.js'

interface ControlClientLike {
  call<T = unknown>(method: string, params?: unknown): Promise<T>
  onState(
    listener: (state: ControlState, topic: ControlTopic | null) => void,
  ): () => void
  close(): void
}

interface LiveControlClient {
  process: ChildProcess
  client: ControlClientLike
  methods: ReadonlySet<string>
  stopState: () => void
  startState(): boolean
  generation: number
}

interface CoreControlConnectionDependencies {
  awaitProcess(): Promise<ChildProcess>
  onLifecycle(listener: (status: CoreStatus) => void): () => void
  createClient(process: ChildProcess): ControlClientLike
  onChange(): void
  onLocalModelEvent(event: LocalModelOperationEvent): void
  onTrafficInvalidation(invalidation: TrafficInvalidation): void
  logError(message: string, error: unknown): void
}

export interface CoreControlConnection extends CoreControlOperations {
  dispose(): void
}

const discoverySchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.object({
    methods: z.array(z.string()),
    feed: z.literal(true),
  }),
  identity: z.object({
    name: z.literal('maximal-core'),
    version: z.string(),
  }),
})

const controlErrorDataSchema = z.object({
  reason: z.enum(CONTROL_ERROR_REASONS),
  retryable: z.boolean(),
  requestId: z.string().optional(),
  remediationUrl: z.string().optional(),
})


class SessionFailure extends Error {
  constructor(
    readonly reason: ControlFailure['reason'],
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'SessionFailure'
  }
}

function failureResult<T>(error: ControlFailure): ControlResult<T> {
  return { ok: false, error }
}

function mapFailure(error: unknown): ControlFailure {
  if (error instanceof SessionFailure) {
    return {
      reason: error.reason,
      message: error.message,
      retryable: error.retryable,
    }
  }

  if (error instanceof ControlRpcError) {
    const data = controlErrorDataSchema.safeParse(error.data)
    if (data.success) {
      return {
        reason: data.data.reason,
        message: error.message,
        retryable: data.data.retryable,
        code: error.code,
        ...(data.data.requestId === undefined
          ? {}
          : { requestId: data.data.requestId }),
        ...(data.data.remediationUrl === undefined
          ? {}
          : { remediationUrl: data.data.remediationUrl }),
      }
    }

    return {
      reason: 'internal',
      message: error.message,
      retryable: false,
      code: error.code,
    }
  }

  if (error instanceof z.ZodError) {
    return {
      reason: 'internal',
      message: error.message,
      retryable: false,
    }
  }

  return {
    reason: 'transport',
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  }
}

function unsupported(method: ControlMethod): ControlResult<never> {
  return failureResult({
    reason: 'unsupported',
    message: `maximal-core does not advertise ${method}`,
    retryable: false,
  })
}

export function createCoreControlConnection(
  options: Partial<CoreControlConnectionDependencies> &
    Pick<
      CoreControlConnectionDependencies,
      'onChange' | 'onTrafficInvalidation'
    >,
): CoreControlConnection {
  const dependencies: CoreControlConnectionDependencies = {
    awaitProcess: awaitCoreProcess,
    onLifecycle: onCoreStatus,
    createClient: controlClientFor,
    logError: (message, error) => mainLogger.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      message,
    ),
    onLocalModelEvent: () => {},
    ...options,
  }

  let live: LiveControlClient | null = null
  let generation = 0
  let disposed = false
  let replacementQueue: Promise<void> = Promise.resolve()

  async function buildClient(process: ChildProcess): Promise<LiveControlClient> {
    const client = dependencies.createClient(process)
    let discovery: z.infer<typeof discoverySchema>
    try {
      discovery = discoverySchema.parse(
        await client.call('server/discover'),
      )
    } catch (error) {
      client.close()
      if (error instanceof ControlRpcError) throw error
      if (error instanceof z.ZodError) {
        throw new SessionFailure(
          'unsupported_version',
          `Incompatible maximal-core discovery response: ${error.message}`,
        )
      }
      throw error
    }

    if (discovery.protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
      client.close()
      throw new SessionFailure(
        'unsupported_version',
        `Unsupported maximal-core control protocol ${discovery.protocolVersion}; expected ${SUPPORTED_PROTOCOL_VERSION}`,
      )
    }

    const methods = new Set(discovery.capabilities.methods)
    const missing = requiredMethods.filter((method) => !methods.has(method))
    if (missing.length > 0) {
      client.close()
      throw new SessionFailure(
        'unsupported_version',
        `maximal-core is missing required control capabilities: ${missing.join(', ')}`,
      )
    }

    const nextGeneration = generation + 1
    let trafficRevision: number | null = null
    const handleState = (state: ControlState, topic: ControlTopic | null): void => {
      if (topic === null || disposed || generation !== nextGeneration) return

      dependencies.onChange()
      if (topic === 'localModels') {
        const event = localModelOperationEventSchema.safeParse(
          Reflect.get(state, 'localModels'),
        )
        if (event.success) dependencies.onLocalModelEvent(event.data)
        else {
          dependencies.logError(
            '[maximal-client] invalid local model event:',
            event.error,
          )
        }
        return
      }
      if (topic === 'snapshot') trafficRevision = null
      const traffic: unknown = Reflect.get(state, 'traffic')
      if (traffic === undefined) {
        if (topic === 'snapshot') {
          dependencies.onTrafficInvalidation({
            contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
            revision: trafficRevision ?? 0,
            emittedAt: new Date().toISOString(),
            activeCount: 0,
            overflow: true,
            scopes: ['requests', 'request-detail', 'overview'],
            requestIds: [],
          })
        }
        return
      }

      const invalidation = TrafficInvalidationSchema.safeParse(traffic)
      if (!invalidation.success) {
        dependencies.logError(
          '[maximal-client] invalid traffic invalidation:',
          invalidation.error,
        )
        return
      }
      if (invalidation.data.revision === trafficRevision) return
      trafficRevision = invalidation.data.revision
      dependencies.onTrafficInvalidation(invalidation.data)
    }

    const next: LiveControlClient = {
      process,
      client,
      methods,
      stopState: () => undefined,
      startState() {
        let delivered = false
        next.stopState = client.onState((state, topic) => {
          if (topic !== null) delivered = true
          handleState(state, topic)
        })
        return delivered
      },
      generation: nextGeneration,
    }
    return next
  }

  function replace(process: ChildProcess): Promise<void> {
    const queued = replacementQueue.then(async () => {
      if (disposed || live?.process === process) return

      const next = await buildClient(process)
      if (disposed) {
        next.stopState()
        next.client.close()
        return
      }

      const stale = live
      generation = next.generation
      live = next
      stale?.stopState()
      stale?.client.close()

      if (!next.startState()) dependencies.onChange()
    })

    replacementQueue = queued.catch(() => {})
    return queued
  }

  async function current(): Promise<LiveControlClient> {
    const process = await dependencies.awaitProcess()
    await replace(process)
    if (!live || live.process !== process) {
      throw new SessionFailure(
        'transport',
        'maximal-core control connection is not available',
        true,
      )
    }
    return live
  }

  async function call<T>(
    method: ControlMethod,
    parse: (input: unknown) => T,
    params?: unknown,
    parseParams?: (input: unknown) => unknown,
  ): Promise<ControlResult<T>> {
    try {
      const validatedParams =
        parseParams === undefined ? params : parseParams(params)
      const active = await current()
      if (!active.methods.has(method)) {
        return unsupported(method)
      }
      return {
        ok: true,
        value: parse(await active.client.call(method, validatedParams)),
      }
    } catch (error) {
      return failureResult(mapFailure(error))
    }
  }

  const stopLifecycle = dependencies.onLifecycle((status) => {
    if (status.phase !== 'ready') return
    void dependencies.awaitProcess().then(replace).catch((error: unknown) => {
      if (!disposed) {
        dependencies.logError(
          '[maximal-client] control discovery failed:',
          error,
        )
      }
    })
  })

  return {
    ...createCoreControlOperations(call),
    dispose() {
      if (disposed) return
      disposed = true
      generation += 1
      stopLifecycle()
      live?.stopState()
      live?.client.close()
      live = null
    },
  }
}
