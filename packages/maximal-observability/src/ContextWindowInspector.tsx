import type {
  TrafficRequestList,
  TrafficRequestSummary,
} from "@maximal/maximal-observability-contract"

import {
  ContextWindowSessionPanel,
  deriveContextSessions,
} from "@maximal/maximal-context-window"
import { InspectorPanel } from "@maximal/maximal-electron/renderer"
import { useState } from "react"

import type { Loadable } from "./state.tsx"

export function ContextWindowInspector({
  requests,
  requestItems,
  preferredSessionId = null,
  onSelectSession,
}: {
  requests: Loadable<TrafficRequestList>
  requestItems: Array<TrafficRequestSummary>
  preferredSessionId?: string | null
  onSelectSession?: (sessionId: string) => void
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  )
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
            setSelectedSessionId(sessionId)
            onSelectSession?.(sessionId)
          }}
        />
      )}
    </InspectorPanel>
  )
}
