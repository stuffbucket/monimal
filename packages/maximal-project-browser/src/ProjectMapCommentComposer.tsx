import { SpatialCanvasCommentComposer } from "@maximal/maximal-electron/renderer"

export interface ProjectMapCommentDraft {
  x: number
  y: number
  body: string
}

export function ProjectMapCommentComposer({
  draft,
  camera,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: ProjectMapCommentDraft
  camera: { x: number; y: number; zoom: number }
  onChange: (draft: ProjectMapCommentDraft) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <SpatialCanvasCommentComposer
      x={camera.x + draft.x * camera.zoom}
      y={camera.y + draft.y * camera.zoom}
      value={draft.body}
      onChange={(body) => onChange({ ...draft, body })}
      onInsertEmoji={() => onChange({ ...draft, body: `${draft.body}🙂` })}
      onInsertMention={() => onChange({ ...draft, body: `${draft.body}@` })}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  )
}
