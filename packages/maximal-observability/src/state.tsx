import type {
  TrafficOverview,
  TrafficRequestDetail,
  TrafficRequestFilters,
  TrafficRequestOutcome,
  TrafficRequestPage,
  TrafficRequestSummary,
} from "@stuffbucket/maximal-observability-contract"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { ObservabilityRead, ObservabilitySource } from "./source.ts"

export type Loadable<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "empty"; data: T }
  | { status: "error"; message: string }
  | { status: "unsupported"; message: string }

export type TimePreset = "15m" | "1h" | "24h" | "7d" | "all"
export type FilterDimension = "clients" | "operations" | "providers" | "models"

export interface ObservabilityContextValue {
  source: ObservabilitySource
  filters: TrafficRequestFilters
  timePreset: TimePreset
  live: boolean
  overview: Loadable<TrafficOverview>
  requests: Loadable<TrafficRequestPage>
  requestItems: Array<TrafficRequestSummary>
  detail: Loadable<TrafficRequestDetail> | null
  selectedRequestId: string | null
  hasMore: boolean
  isLoadingMore: boolean
  setTimePreset: (preset: TimePreset) => void
  setDimension: (dimension: FilterDimension, value: string) => void
  setOutcome: (value: "all" | TrafficRequestOutcome) => void
  setLive: (live: boolean) => void
  selectRequest: (requestId: string | null) => void
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

const ObservabilityContext = createContext<ObservabilityContextValue | null>(
  null,
)

const EMPTY_FILTERS: TrafficRequestFilters = {
  range: null,
  states: [],
  outcomes: [],
  operations: [],
  providers: [],
  models: [],
  clients: [],
  search: null,
  minimumDurationMs: null,
  maximumDurationMs: null,
}

function rangeForPreset(
  preset: TimePreset,
  now: Date,
): TrafficRequestFilters["range"] {
  if (preset === "all") return null
  const durationMs = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "24h": 24 * 60 * 60_000,
    "7d": 7 * 24 * 60 * 60_000,
  }[preset]
  return {
    from: new Date(now.getTime() - durationMs).toISOString(),
    to: now.toISOString(),
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ?
      error.message
    : "The traffic source could not be read."
}

function loadable<T>(
  result: ObservabilityRead<T>,
  isEmpty: (data: T) => boolean,
): Loadable<T> {
  if (result.status === "unsupported") return result
  return isEmpty(result.data) ?
      { status: "empty", data: result.data }
    : { status: "ready", data: result.data }
}

export function ObservabilityProvider({
  source,
  children,
  now = () => new Date(),
}: {
  source: ObservabilitySource
  children: ReactNode
  now?: () => Date
}) {
  const [filters, setFilters] = useState<TrafficRequestFilters>(() => ({
    ...EMPTY_FILTERS,
    range: rangeForPreset("1h", now()),
  }))
  const [timePreset, setTimePresetState] = useState<TimePreset>("1h")
  const [live, setLive] = useState(true)
  const [overview, setOverview] = useState<Loadable<TrafficOverview>>({
    status: "loading",
  })
  const [requests, setRequests] = useState<Loadable<TrafficRequestPage>>({
    status: "loading",
  })
  const [requestItems, setRequestItems] = useState<
    Array<TrafficRequestSummary>
  >([])
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  )
  const [detail, setDetail] = useState<Loadable<TrafficRequestDetail> | null>(
    null,
  )
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const overviewGeneration = useRef(0)
  const requestsGeneration = useRef(0)

  const readOverview = useCallback(async () => {
    const current = ++overviewGeneration.current
    setOverview({ status: "loading" })
    try {
      const result = await source.readOverview({ filters, tokenBucketMs: null })
      if (overviewGeneration.current === current) {
        setOverview(loadable(result, ({ totals }) => totals.requests === 0))
      }
    } catch (error) {
      if (overviewGeneration.current === current)
        setOverview({ status: "error", message: messageFrom(error) })
    }
  }, [filters, source])

  const readFirstPage = useCallback(async () => {
    const current = ++requestsGeneration.current
    setRequests({ status: "loading" })
    try {
      const result = await source.readRequests({
        filters,
        cursor: null,
        limit: 50,
        sort: "acceptedAt",
        direction: "descending",
      })
      if (requestsGeneration.current !== current) return
      setRequests(loadable(result, ({ items }) => items.length === 0))
      setRequestItems(result.status === "ready" ? result.data.items : [])
    } catch (error) {
      if (requestsGeneration.current === current) {
        setRequests({ status: "error", message: messageFrom(error) })
        setRequestItems([])
      }
    }
  }, [filters, source])

  const refresh = useCallback(async () => {
    await Promise.all([readOverview(), readFirstPage()])
  }, [readFirstPage, readOverview])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!live) return undefined
    return source.subscribeTrafficInvalidation((invalidation) => {
      if (
        invalidation.scopes.includes("overview")
        || invalidation.scopes.includes("requests")
      ) {
        void refresh()
      }
      if (
        selectedRequestId
        && invalidation.scopes.includes("request-detail")
        && (invalidation.requestIds.length === 0
          || invalidation.requestIds.includes(selectedRequestId))
      ) {
        void source
          .readRequestDetail({ requestId: selectedRequestId })
          .then((result) => {
            setDetail(loadable(result, () => false))
          })
          .catch((error: unknown) =>
            setDetail({ status: "error", message: messageFrom(error) }),
          )
      }
    })
  }, [live, refresh, selectedRequestId, source])

  const setTimePreset = useCallback(
    (preset: TimePreset) => {
      setTimePresetState(preset)
      setFilters((current) => ({
        ...current,
        range: rangeForPreset(preset, now()),
      }))
    },
    [now],
  )

  const setDimension = useCallback(
    (dimension: FilterDimension, value: string) => {
      setFilters((current) => ({
        ...current,
        [dimension]: value === "all" ? [] : [value],
      }))
    },
    [],
  )

  const setOutcome = useCallback((value: "all" | TrafficRequestOutcome) => {
    setFilters((current) => ({
      ...current,
      outcomes: value === "all" ? [] : [value],
    }))
  }, [])

  const selectRequest = useCallback(
    (requestId: string | null) => {
      setSelectedRequestId(requestId)
      if (requestId === null) {
        setDetail(null)
        return
      }
      setDetail({ status: "loading" })
      void source
        .readRequestDetail({ requestId })
        .then((result) => {
          setDetail(loadable(result, () => false))
        })
        .catch((error: unknown) =>
          setDetail({ status: "error", message: messageFrom(error) }),
        )
    },
    [source],
  )

  const hasMore = requests.status === "ready" && requests.data.hasMore
  const loadMore = useCallback(async () => {
    if (
      requests.status !== "ready"
      || !requests.data.nextCursor
      || isLoadingMore
    )
      return
    setIsLoadingMore(true)
    try {
      const result = await source.readRequests({
        filters,
        cursor: requests.data.nextCursor,
        limit: 50,
        sort: "acceptedAt",
        direction: "descending",
      })
      if (result.status === "unsupported") {
        setRequests(result)
      } else {
        setRequests({ status: "ready", data: result.data })
        setRequestItems((items) => [...items, ...result.data.items])
      }
    } catch (error) {
      setRequests({ status: "error", message: messageFrom(error) })
    } finally {
      setIsLoadingMore(false)
    }
  }, [filters, isLoadingMore, requests, source])

  const value = useMemo<ObservabilityContextValue>(
    () => ({
      source,
      filters,
      timePreset,
      live,
      overview,
      requests,
      requestItems,
      detail,
      selectedRequestId,
      hasMore,
      isLoadingMore,
      setTimePreset,
      setDimension,
      setOutcome,
      setLive,
      selectRequest,
      loadMore,
      refresh,
    }),
    [
      detail,
      filters,
      hasMore,
      isLoadingMore,
      live,
      loadMore,
      overview,
      refresh,
      requestItems,
      requests,
      selectRequest,
      selectedRequestId,
      setDimension,
      setOutcome,
      setTimePreset,
      source,
      timePreset,
    ],
  )

  return (
    <ObservabilityContext.Provider value={value}>
      {children}
    </ObservabilityContext.Provider>
  )
}

export function useObservability(): ObservabilityContextValue {
  const value = useContext(ObservabilityContext)
  if (!value)
    throw new Error("Observability components require ObservabilityProvider.")
  return value
}
