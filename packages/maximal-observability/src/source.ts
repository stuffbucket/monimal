import type {
  TrafficInvalidationListener,
  TrafficOverview,
  TrafficOverviewQuery,
  TrafficRequestDetail,
  TrafficRequestDetailQuery,
  TrafficRequestList,
  TrafficRequestListQuery,
  TrafficUnsubscribe,
} from "@stuffbucket/maximal-observability-contract"

export type ObservabilityRead<T> =
  { status: "ready"; data: T } | { status: "unsupported"; message: string }

export interface ObservabilitySource {
  readOverview(
    query: TrafficOverviewQuery,
  ): Promise<ObservabilityRead<TrafficOverview>>
  readRequests(
    query: TrafficRequestListQuery,
  ): Promise<ObservabilityRead<TrafficRequestList>>
  readRequestDetail(
    query: TrafficRequestDetailQuery,
  ): Promise<ObservabilityRead<TrafficRequestDetail>>
  subscribeTrafficInvalidation(
    listener: TrafficInvalidationListener,
  ): TrafficUnsubscribe
}
