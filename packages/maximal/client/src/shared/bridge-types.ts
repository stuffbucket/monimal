import type { ControlErrorReason } from '@stuffbucket/maximal-core/control-contract'
import type {
  TrafficInvalidationListener,
  TrafficOverview,
  TrafficOverviewQuery,
  TrafficRequestDetail,
  TrafficRequestDetailQuery,
  TrafficRequestListQuery,
  TrafficRequestPage,
} from '@stuffbucket/maximal-observability-contract'

/** Sidecar lifecycle state that is safe to expose to the product renderer. */
export type LifecycleStatus =
  | { phase: 'starting' }
  | { phase: 'boot-status'; message: string }
  | { phase: 'ready'; proxyUrl: string; pid: number }
  | {
      phase: 'crashed'
      code: number | null
      signal: string | null
      attempt: number
      willRetry: boolean
    }
  | { phase: 'restarting'; attempt: number; delayMs: number }
  | { phase: 'failed'; reason: string }
  | { phase: 'stopped' }

export type ControlFailureReason =
  | ControlErrorReason
  | 'transport'
  | 'unsupported'

/** Serializable control failure; Electron does not preserve custom Error fields. */
export interface ControlFailure {
  reason: ControlFailureReason
  message: string
  retryable: boolean
  requestId?: string
  remediationUrl?: string
  code?: number
}

export type ControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ControlFailure }

/** The observability-only subset of the named preload control bridge. */
export interface ObservabilityControlBridge {
  observabilityOverview(
    query: TrafficOverviewQuery,
  ): Promise<ControlResult<TrafficOverview>>
  observabilityRequests(
    query: TrafficRequestListQuery,
  ): Promise<ControlResult<TrafficRequestPage>>
  observabilityRequest(
    query: TrafficRequestDetailQuery,
  ): Promise<ControlResult<TrafficRequestDetail | null>>
  onTrafficInvalidation(listener: TrafficInvalidationListener): () => void
}

export interface PendingSettingsRequest {
  sectionId: string | null
}

export interface MenuBarModeState {
  enabled: boolean
  pending: boolean
}

export interface MenuBarModeAttempt {
  attemptId: string
  deadlineMs: number
}
