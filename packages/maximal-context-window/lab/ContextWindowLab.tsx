import { InspectorPanel } from "@stuffbucket/maximal-electron/renderer"
import { useState, type ReactElement } from "react"

import { deriveContextSessions } from "../src/context-window.ts"
import { ContextWindowSessionPanel } from "../src/ContextWindowSessionPanel.tsx"
import { LAB_INPUT_SEGMENTS, LAB_REQUESTS } from "./fixtures.ts"

export function ContextWindowLab(): ReactElement {
  const sessions = deriveContextSessions(LAB_REQUESTS)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  )
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const session =
    sessions.find(({ id }) => id === selectedSessionId) ?? sessions[0]

  return (
    <div className="lab-shell sb-shell" data-theme={theme}>
      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        style={{ marginBlockEnd: "1rem" }}
      >
        Switch to {theme === "dark" ? "light" : "dark"} mode
      </button>
      <InspectorPanel title="Context window">
        {session ?
          <ContextWindowSessionPanel
            session={session}
            sessionIds={sessions.map(({ id }) => id)}
            onSelectSession={setSelectedSessionId}
            inputSegmentsFor={(turn) =>
              LAB_INPUT_SEGMENTS.get(turn.identity.requestId)
            }
          />
        : <p>No fixture sessions available.</p>}
      </InspectorPanel>
    </div>
  )
}
