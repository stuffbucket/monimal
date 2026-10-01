import { SpatialCanvasCursor } from "@maximal/maximal-electron/renderer"

import type { ProjectMapPresence } from "./store.ts"

export function ProjectMapPresenceCursors({
  collaborators,
  viewId,
}: {
  collaborators: Array<ProjectMapPresence>
  viewId: string
}) {
  return collaborators
    .filter((person) => person.viewId !== viewId && person.cursor)
    .map((person) => (
      <SpatialCanvasCursor
        key={person.viewId}
        x={person.cursor?.x ?? 0}
        y={person.cursor?.y ?? 0}
        color={person.color}
      >
        {person.name}
      </SpatialCanvasCursor>
    ))
}
