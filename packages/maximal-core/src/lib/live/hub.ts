import type { TrafficInvalidation } from "@maximal/maximal-observability-contract"

import { TRAFFIC_INVALIDATION_REQUEST_IDS_MAX } from "@maximal/maximal-observability-contract"

import {
  CONTROL_PROTOCOL_VERSION,
  type ControlFrame,
  type ControlTopic,
  type FrameEnvelope,
  notificationForFrame,
  type SnapshotPayload,
} from "~/lib/live/contract"
import { BoundedQueue, CLOSED } from "~/lib/live/queue"

/**
 * The write sink a transport (the SSE route, or a test) provides. `write` MUST
 * apply real backpressure — resolve only once the frame has flushed to the
 * socket — so a slow client overflows its own bounded queue instead of blocking
 * the shared producer.
 */
export interface ControlSink {
  write(frame: string): Promise<void>
  close(reason: string): void
}

export interface ControlNotificationSink {
  write(frame: FrameEnvelope): Promise<void>
  close(reason: string): void
}

interface HubMessage {
  sse: string
  notification?: FrameEnvelope
}

interface Subscriber {
  readonly sink: {
    write(message: HubMessage): Promise<void>
    close(reason: string): void
  }
  readonly queue: BoundedQueue<HubMessage>
  alive: boolean
}

export interface ControlHubOptions<Snapshot = unknown> {
  /** Builds the full current-state snapshot for a connecting client. Injected so
   *  the hub stays decoupled from the (still being re-homed) aggregators. */
  buildSnapshot: () => Promise<Snapshot>
  /** Per-subscriber queue depth before a slow client is dropped. */
  queueCapacity?: number
  /** If set, send an SSE keepalive comment to every subscriber this often.
   *  Enqueued through each subscriber's queue, so the single drain loop stays
   *  the only writer. Omit to disable (the default). */
  heartbeatMs?: number
}

const DEFAULT_QUEUE_CAPACITY = 256

/** SSE comment sent on each heartbeat tick — keeps idle connections open
 *  through intermediaries and surfaces a dead peer (an unwritable socket
 *  overflows the queue and the subscriber is dropped). */
const HEARTBEAT_FRAME = ": keepalive\n\n"

/**
 * Owns fan-out to every connected subscriber. Library-first: the SSE route and
 * any in-process embedder drive this same API. Per-subscriber bounded queue with
 * drop-slow-then-disconnect (Tailscale's shape), so one wedged client can never
 * stall the shared producer.
 *
 * There is deliberately **no cursor, ring, or epoch**. ADR-0023 makes the
 * control plane stateless, so a dropped feed reconnects and re-snapshots rather
 * than replaying. That removes the resume bookkeeping entirely — and with it the
 * reason `emit` and `emitEdge` had to be different methods, since nothing is
 * ringed for a transient frame to evict.
 */
export class ControlHub<Snapshot = unknown> {
  private readonly subscribers = new Set<Subscriber>()

  private latestUsage: unknown = undefined
  private usageDirty = false
  private pendingTraffic: TrafficInvalidation | null = null

  private readonly buildSnapshot: () => Promise<Snapshot>
  private readonly queueCapacity: number
  private readonly heartbeatTimer: ReturnType<typeof setInterval> | null

  constructor(options: ControlHubOptions<Snapshot>) {
    this.buildSnapshot = options.buildSnapshot
    this.queueCapacity = options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY
    this.heartbeatTimer =
      options.heartbeatMs === undefined ?
        null
      : this.startHeartbeat(options.heartbeatMs)
  }

  private startHeartbeat(intervalMs: number): ReturnType<typeof setInterval> {
    const timer = setInterval(() => {
      this.fanout(null)
    }, intervalMs)
    timer.unref()
    return timer
  }

  /** Stop the heartbeat timer. For tests and a clean shutdown. */
  dispose(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
  }

  // ── Producer API ────────────────────────────────────────────────────────

  /**
   * Publish a state change to every live subscriber.
   *
   * One method, not the old cursored/edge pair: with nothing ringed there is no
   * ring for a high-frequency topic to evict, so the distinction that justified
   * two methods no longer exists.
   */
  emit(topic: ControlTopic, data: unknown): void {
    this.fanout({ topic, data })
  }

  /** Record a usage tick. Still coalesced — that was always about volume, not
   *  resume: a per-request storm would otherwise overflow every subscriber's
   *  bounded queue and get slow clients dropped. */
  recordUsage(data: unknown): void {
    this.latestUsage = data
    this.usageDirty = true
  }

  /** Emit at most one coalesced usage frame. Wire to an interval in production;
   *  called directly in tests for determinism. */
  flushUsage(): void {
    if (!this.usageDirty) return
    this.usageDirty = false
    this.emit("usage", this.latestUsage)
  }

  /** Merge high-frequency traffic hints without retaining request payloads. */
  recordTraffic(invalidation: TrafficInvalidation): void {
    const previous = this.pendingTraffic
    if (!previous) {
      this.pendingTraffic = invalidation
      return
    }
    const requestIds = [
      ...new Set([...previous.requestIds, ...invalidation.requestIds]),
    ]
    this.pendingTraffic = {
      contractVersion: invalidation.contractVersion,
      revision: Math.max(previous.revision, invalidation.revision),
      emittedAt: invalidation.emittedAt,
      activeCount: invalidation.activeCount,
      overflow:
        previous.overflow
        || invalidation.overflow
        || requestIds.length > TRAFFIC_INVALIDATION_REQUEST_IDS_MAX,
      scopes: [...new Set([...previous.scopes, ...invalidation.scopes])],
      requestIds: requestIds.slice(0, TRAFFIC_INVALIDATION_REQUEST_IDS_MAX),
    }
  }

  /** Emit at most one bounded traffic invalidation per service tick. */
  flushTraffic(): void {
    if (!this.pendingTraffic) return
    const invalidation = this.pendingTraffic
    this.pendingTraffic = null
    this.emit("traffic", invalidation)
  }

  // ── Consumer API ────────────────────────────────────────────────────────

  /**
   * Attach a subscriber. Registers it for fan-out synchronously (so no frame is
   * missed during the snapshot build), pushes the snapshot at the head of its
   * queue, then starts the single drain loop. Returns an unsubscribe function.
   *
   * Every connect is a fresh snapshot — there is no resume path to take instead.
   */
  async subscribe(sink: ControlSink): Promise<() => void> {
    return this.subscribeSink({
      write: (message) => sink.write(message.sse),
      close: (reason) => sink.close(reason),
    })
  }

  /** Deliver JSON-RPC notifications directly to non-HTTP transports. */
  async subscribeNotifications(
    sink: ControlNotificationSink,
  ): Promise<() => void> {
    return this.subscribeSink({
      write: (message) =>
        message.notification ?
          sink.write(message.notification)
        : Promise.resolve(),
      close: (reason) => sink.close(reason),
    })
  }

  private async subscribeSink(sink: Subscriber["sink"]): Promise<() => void> {
    const subscriber: Subscriber = {
      sink,
      queue: new BoundedQueue<HubMessage>(this.queueCapacity),
      alive: true,
    }
    this.subscribers.add(subscriber)

    let snapshot: Snapshot
    try {
      snapshot = await this.buildSnapshot()
    } catch (error) {
      // Registered before the await, so a failed build cannot leak it.
      this.remove(subscriber, "snapshot_failed")
      throw error
    }
    const payload: SnapshotPayload<Snapshot> = {
      protocolVersion: CONTROL_PROTOCOL_VERSION,
      snapshot,
    }
    subscriber.queue.pushFront(
      this.messageFor({ topic: "snapshot", data: payload }),
    )

    void this.drain(subscriber)
    return () => {
      this.remove(subscriber, "client_close")
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private messageFor(frame: ControlFrame): HubMessage {
    const notification = notificationForFrame(frame)
    return {
      notification,
      sse: `data: ${JSON.stringify(notification)}\n\n`,
    }
  }

  private fanout(frame: ControlFrame | null): void {
    // The frame is serialized once and the same string is shared to every
    // queue. Iterate a copy — overflow removal mutates the set mid-loop.
    const message = frame ? this.messageFor(frame) : { sse: HEARTBEAT_FRAME }
    for (const subscriber of Array.from(this.subscribers)) {
      if (!subscriber.queue.push(message)) {
        this.remove(subscriber, "overflow")
      }
    }
  }

  private async drain(subscriber: Subscriber): Promise<void> {
    try {
      while (subscriber.alive) {
        const item = await subscriber.queue.take()
        if (item === CLOSED) break
        await subscriber.sink.write(item)
      }
    } catch {
      // A write threw: dead or half-open peer. Fall through to cleanup — this
      // is the detector for connections onAbort never fires for.
    } finally {
      this.remove(subscriber, "drain_end")
    }
  }

  private remove(subscriber: Subscriber, reason: string): void {
    if (!subscriber.alive) return
    subscriber.alive = false
    this.subscribers.delete(subscriber)
    subscriber.queue.close()
    subscriber.sink.close(reason)
  }

  // ── Introspection (tests / diagnostics) ─────────────────────────────────

  get stats(): { subscribers: number } {
    return { subscribers: this.subscribers.size }
  }
}
