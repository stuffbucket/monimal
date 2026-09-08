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

const systemNow = (): Date => new Date()

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
  projects: [],
  streaming: null,
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

// eslint-disable-next-line max-lines-per-function
export function ObservabilityProvider({
  source,
  children,
  now = systemNow,
}: {
  source: ObservabilitySource
  children: ReactNode
  now?: () => Date
}) {
  const nowRef = useRef(now)
  nowRef.current = now
  const [filters, setFilters] = useState<TrafficRequestFilters>(() => ({
    ...EMPTY_FILTERS,
    range: rangeForPreset("1h", nowRef.current()),
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
  const detailGeneration = useRef(0)
  const loadingMore = useRef(false)
  const pageFilters = useRef<TrafficRequestFilters | null>(null)

  const readOverview = useCallback(
    async (activeFilters: TrafficRequestFilters) => {
      const current = ++overviewGeneration.current
      setOverview({ status: "loading" })
      try {
        const result = await source.readOverview({
          filters: activeFilters,
          tokenBucketMs: null,
        })
        if (overviewGeneration.current === current) {
          setOverview(loadable(result, ({ totals }) => totals.requests === 0))
        }
      } catch (error) {
        if (overviewGeneration.current === current)
          setOverview({ status: "error", message: messageFrom(error) })
      }
    },
    [source],
  )

  const readFirstPage = useCallback(
    async (activeFilters: TrafficRequestFilters) => {
      const current = ++requestsGeneration.current
      loadingMore.current = false
      setIsLoadingMore(false)
      pageFilters.current = activeFilters
      setRequests({ status: "loading" })
      try {
        const result = await source.readRequests({
          filters: activeFilters,
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
    },
    [source],
  )

  const refresh = useCallback(async () => {
    const activeFilters = {
      ...filters,
      range: rangeForPreset(timePreset, nowRef.current()),
    }
    await Promise.all([
      readOverview(activeFilters),
      readFirstPage(activeFilters),
    ])
  }, [filters, readFirstPage, readOverview, timePreset])

  const readDetail = useCallback(
    async (requestId: string, showLoading: boolean) => {
      const current = ++detailGeneration.current
      if (showLoading) setDetail({ status: "loading" })
      try {
        const result = await source.readRequestDetail({ requestId })
        if (detailGeneration.current === current)
          setDetail(loadable(result, () => false))
      } catch (error) {
        if (detailGeneration.current === current)
          setDetail({ status: "error", message: messageFrom(error) })
      }
    },
    [source],
  )

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
        && (invalidation.overflow
          || invalidation.requestIds.length === 0
          || invalidation.requestIds.includes(selectedRequestId))
      ) {
        void readDetail(selectedRequestId, false)
      }
    })
  }, [live, readDetail, refresh, selectedRequestId, source])

  const setTimePreset = useCallback((preset: TimePreset) => {
    setTimePresetState(preset)
    setFilters((current) => ({
      ...current,
      range: rangeForPreset(preset, nowRef.current()),
    }))
  }, [])

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
        detailGeneration.current += 1
        setDetail(null)
        return
      }
      void readDetail(requestId, true)
    },
    [readDetail],
  )

  const hasMore = requests.status === "ready" && requests.data.hasMore
  const loadMore = useCallback(async () => {
    if (
      requests.status !== "ready"
      || !requests.data.nextCursor
      || loadingMore.current
    )
      return
    const current = requestsGeneration.current
    const activeFilters = pageFilters.current
    if (!activeFilters) return
    loadingMore.current = true
    setIsLoadingMore(true)
    try {
      const result = await source.readRequests({
        filters: activeFilters,
        cursor: requests.data.nextCursor,
        limit: 50,
        sort: "acceptedAt",
        direction: "descending",
      })
      if (requestsGeneration.current !== current) return
      if (result.status === "unsupported") {
        setRequests(result)
      } else {
        setRequests({ status: "ready", data: result.data })
        setRequestItems((items) => [...items, ...result.data.items])
      }
    } catch (error) {
      if (requestsGeneration.current === current)
        setRequests({ status: "error", message: messageFrom(error) })
    } finally {
      if (requestsGeneration.current === current) {
        // The generation check excludes any newer refresh or pagination request.
        // eslint-disable-next-line require-atomic-updates
        loadingMore.current = false
        setIsLoadingMore(false)
      }
    }
  }, [requests, source])

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
