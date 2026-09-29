import type {
  TrafficRequestList,
  TrafficRequestSummary,
} from "@maximal/maximal-observability-contract"

import {
  ContextWindowSessionPanel,
  deriveContextSessions,
} from "@maximal/maximal-context-window"
import { InspectorPanel } from "@maximal/maximal-electron/renderer"

import { type Loadable, useObservability } from "./state.tsx"

export function ContextWindowInspector({
  selectedSessionId,
  onSelectSession,
}: {
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
}) {
  const { requestItems, requests } = useObservability()
  return (
    <aside className="mo-inspector" aria-label="Context window">
      <ContextWindowPanel
        requests={requests}
        requestItems={requestItems}
        selectedSessionId={selectedSessionId}
        onSelectSession={onSelectSession}
      />
    </aside>
  )
}

export function ContextWindowPanel({
  requests,
  requestItems,
  preferredSessionId = null,
  selectedSessionId = null,
  onSelectSession,
}: {
  requests: Loadable<TrafficRequestList>
  requestItems: Array<TrafficRequestSummary>
  preferredSessionId?: string | null
  selectedSessionId?: string | null
  onSelectSession?: (sessionId: string) => void
}) {
  const sessions = deriveContextSessions(requestItems)
  const session =
    sessions.find(({ id }) => id === preferredSessionId)
    ?? sessions.find(({ id }) => id === selectedSessionId)
    ?? sessions[0]

  return (
    <InspectorPanel title="Context window">
      {requests.status === "loading" && (
        <p className="mo-state" role="status" aria-live="polite">
          Loading session context…
        </p>
      )}
      {requests.status === "error" && (
        <p className="mo-state" role="alert">
          Session context could not be loaded. {requests.message}
        </p>
      )}
      {requests.status === "unsupported" && (
        <p className="mo-state">
          Session context is not supported. {requests.message}
        </p>
      )}
      {(requests.status === "ready" || requests.status === "empty")
        && !session && (
          <p className="mo-state">
            No session-scoped traffic is available for these filters.
          </p>
        )}
      {session && (
        <ContextWindowSessionPanel
          session={session}
          sessionIds={sessions.map(({ id }) => id)}
          onSelectSession={(sessionId) => {
            onSelectSession?.(sessionId)
          }}
        />
      )}
    </InspectorPanel>
  )
}
