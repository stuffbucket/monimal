import {
  SpatialCanvasCommentAnchor,
  SpatialCanvasCommentCursor,
} from "@maximal/maximal-electron/renderer"

import type { ProjectMapTool } from "./model.ts"
import type { Camera, Point } from "./view.ts"

import {
  ProjectMapCommentComposer,
  type ProjectMapCommentDraft,
} from "./ProjectMapCommentComposer.tsx"

export function ProjectMapCommentPlacement({
  tool,
  cursor,
  camera,
  color,
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  tool: ProjectMapTool
  cursor: Point | undefined
  camera: Camera
  color: string
  draft: ProjectMapCommentDraft | undefined
  onDraftChange: (draft: ProjectMapCommentDraft) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <>
      {tool === "comment" && cursor ?
        <SpatialCanvasCommentCursor
          x={camera.x + cursor.x * camera.zoom}
          y={camera.y + cursor.y * camera.zoom}
          color={color}
        />
      : null}
      {draft ?
        <>
          <SpatialCanvasCommentAnchor
            x={camera.x + draft.x * camera.zoom}
            y={camera.y + draft.y * camera.zoom}
            color={color}
          />
          <ProjectMapCommentComposer
            draft={draft}
            camera={camera}
            onChange={onDraftChange}
            onSubmit={onSubmit}
            onCancel={onCancel}
            color={color}
          />
        </>
      : null}
    </>
  )
}
