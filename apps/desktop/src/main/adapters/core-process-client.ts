import {
  CONTROL_PROTOCOL_VERSION,
  CONTROL_TOPICS,
  frameEnvelopeSchema,
  type ControlTopic,
} from '@maximal/maximal-core/contract'
import { ControlRpcError, type ControlState } from '@maximal/maximal-core/client'
import { z } from 'zod'

import { mainLogger } from '../main-logger.js'

const responseSchema = z.object({
  kind: z.literal('rpc-result'),
  id: z.number().int().nonnegative(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
})
const eventSchema = z.object({
  kind: z.literal('control-event'),
  frame: frameEnvelopeSchema,
})
const snapshotSchema = z.object({
  protocolVersion: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
})
const topicSchema = z.enum(CONTROL_TOPICS)

interface CoreProcessChannel {
  readonly connected: boolean
  send(message: unknown, callback: (error: Error | null) => void): boolean
  on(event: 'message', listener: (message: unknown) => void): this
  on(event: 'disconnect' | 'exit', listener: () => void): this
  off(event: 'message', listener: (message: unknown) => void): this
  off(event: 'disconnect' | 'exit', listener: () => void): this
}

export class CoreProcessClient {
  private readonly pending = new Map<number, {
    resolve(value: unknown): void
    reject(error: Error): void
  }>()
  private readonly listeners = new Set<(state: ControlState, topic: ControlTopic | null) => void>()
  private nextId = 0
  private closed = false
  private state: ControlState = {}
  private hasSnapshot = false

  constructor(private readonly child: CoreProcessChannel) {
    child.on('message', this.onMessage)
    child.on('disconnect', this.onDisconnect)
    child.on('exit', this.onDisconnect)
  }

  private readonly onDisconnect = (): void => {
    this.close()
  }

  private readonly onMessage = (input: unknown): void => {
    if (this.closed) return
    const response = responseSchema.safeParse(input)
    if (response.success) {
      const pending = this.pending.get(response.data.id)
      if (!pending) return
      this.pending.delete(response.data.id)
      if (response.data.error) {
        const { code, message, data } = response.data.error
        pending.reject(new ControlRpcError(code, message, data))
      } else {
        pending.resolve(response.data.result)
      }
      return
    }
    if (typeof input === 'object' && input !== null && 'kind' in input && input.kind === 'rpc-result') {
      this.fail(new Error('Maximal Core sent an invalid process RPC result'))
      return
    }
    const event = eventSchema.safeParse(input)
    if (!event.success) {
      if (typeof input === 'object' && input !== null && 'kind' in input && input.kind === 'control-event') {
        this.fail(new Error('Maximal Core sent an invalid control event'))
      }
      return
    }
    const frame = event.data.frame
    if (!frame.method.startsWith('control/')) {
      this.fail(new Error('Maximal Core sent an unknown event method'))
      return
    }
    const topic = topicSchema.safeParse(frame.method.slice('control/'.length))
    if (!topic.success) {
      this.fail(new Error('Maximal Core sent an unknown control topic'))
      return
    }
    if (topic.data === 'snapshot') {
      const payload = snapshotSchema.safeParse(frame.params)
      if (!payload.success || payload.data.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
        this.fail(new Error('Maximal Core sent an incompatible control snapshot'))
        return
      }
      this.state = payload.data.snapshot
      this.hasSnapshot = true
    } else {
      this.state = { ...this.state, [topic.data]: frame.params }
    }
    for (const listener of this.listeners) listener(this.state, topic.data)
  }

  private fail(error: Error): void {
    mainLogger.error({ errorName: error.name }, error.message)
    this.close(error)
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed || !this.child.connected) {
      return Promise.reject(new Error('Maximal Core process IPC is disconnected'))
    }
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      try {
        this.child.send(
          { kind: 'rpc', id, method, ...(params === undefined ? {} : { params }) },
          (error) => {
            if (!error) return
            this.pending.delete(id)
            reject(error)
          },
        )
      } catch (error) {
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  onState(listener: (state: ControlState, topic: ControlTopic | null) => void): () => void {
    this.listeners.add(listener)
    listener(this.state, this.hasSnapshot ? 'snapshot' : null)
    return () => this.listeners.delete(listener)
  }

  close(error: Error = new Error('Maximal Core process IPC closed')): void {
    if (this.closed) return
    this.closed = true
    this.child.off('message', this.onMessage)
    this.child.off('disconnect', this.onDisconnect)
    this.child.off('exit', this.onDisconnect)
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
    this.listeners.clear()
  }
}
