import {
  SpatialCanvasCommentThreadCard,
  type SpatialCanvasCommentEntry,
} from "@maximal/maximal-electron/renderer"

import type { ProjectMapComment, SceneItem } from "./model.ts"
import type { ProjectMapViewer } from "./store.ts"

export interface ProjectMapPoint {
  x: number
  y: number
}

export function commentInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function commentTimestampLabel(value?: string): string {
  if (!value) return "Just now"
  const elapsed = Date.now() - Date.parse(value)
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Just now"
  if (elapsed < 3_600_000) return `${String(Math.floor(elapsed / 60_000))}m`
  if (elapsed < 86_400_000) return `${String(Math.floor(elapsed / 3_600_000))}h`
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function commentPosition(
  comment: Pick<ProjectMapComment, "anchor" | "x" | "y">,
  itemById: ReadonlyMap<string, SceneItem>,
): ProjectMapPoint {
  const anchor = comment.anchor
  if (anchor) {
    const item = itemById.get(anchor.itemId)
    if (item && "x" in item) {
      return { x: item.x + anchor.offsetX, y: item.y + anchor.offsetY }
    }
  }
  return { x: comment.x, y: comment.y }
}

function entry(value: {
  id: string
  author: string
  authorInitials?: string
  authorColor?: string
  body: string
  createdAt?: string
}): SpatialCanvasCommentEntry {
  return {
    id: value.id,
    initials: value.authorInitials ?? commentInitials(value.author),
    author: value.author,
    body: value.body,
    timestamp: commentTimestampLabel(value.createdAt),
    ...(value.authorColor ? { color: value.authorColor } : {}),
  }
}

export function ProjectMapActiveComment({
  comment,
  position,
  camera,
  viewportWidth,
  viewportHeight,
  viewer,
  reply,
  onReplyChange,
  onSubmitReply,
  onToggleResolved,
  onDelete,
  onClose,
}: {
  comment: ProjectMapComment
  position: ProjectMapPoint
  camera: { x: number; y: number; zoom: number }
  viewportWidth: number
  viewportHeight: number
  viewer: ProjectMapViewer
  reply: string
  onReplyChange: (value: string) => void
  onSubmitReply: () => void
  onToggleResolved: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const screenX = camera.x + position.x * camera.zoom
  const screenY = camera.y + position.y * camera.zoom
  return (
    <SpatialCanvasCommentThreadCard
      x={screenX}
      y={screenY}
      side={screenX > viewportWidth / 2 ? "left" : "right"}
      vertical={screenY > viewportHeight * 0.6 ? "above" : "below"}
      comment={entry(comment)}
      replies={(comment.replies ?? []).map((reply) => entry(reply))}
      resolved={comment.resolved}
      reply={reply}
      replyInitials={viewer.initials}
      onReplyChange={onReplyChange}
      onSubmitReply={onSubmitReply}
      onToggleResolved={onToggleResolved}
      onDelete={onDelete}
      onClose={onClose}
    />
  )
}
