import {
  Button,
  SpatialCanvasCommentThread,
  SpatialCanvasPanelHeader,
  SpatialCanvasSidePanel,
  TextInput,
} from "@maximal/maximal-electron/renderer"
import { useState } from "react"

import type { ProjectMapComment, ProjectMapMessage } from "./model.ts"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function ProjectMapDiscussion({
  kind,
  comments,
  messages,
  onClose,
  onToggleComment,
  activeCommentId,
  onSelectComment,
  onSubmit,
}: {
  kind: "comments" | "chat"
  comments: Array<ProjectMapComment>
  messages: Array<ProjectMapMessage>
  onClose: () => void
  onToggleComment: (commentId: string) => void
  activeCommentId?: string
  onSelectComment: (commentId: string) => void
  onSubmit: (body: string) => void
}) {
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const commentsPanel = kind === "comments"
  const title = commentsPanel ? "Comments" : "Team chat"
  const visibleComments = comments.filter((comment) =>
    `${comment.author} ${comment.body}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  return (
    <SpatialCanvasSidePanel
      label={title}
      title={title}
      onClose={onClose}
      edge={commentsPanel}
      {...(commentsPanel ?
        {
          header: (
            <SpatialCanvasPanelHeader>
              <TextInput
                aria-label="Search comments"
                value={query}
                placeholder="Search comments"
                onChange={setQuery}
              />
            </SpatialCanvasPanelHeader>
          ),
        }
      : {})}
      footer={
        !commentsPanel ?
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const body = draft.trim()
              if (!body) return
              onSubmit(body)
              setDraft("")
            }}
          >
            <TextInput
              aria-label="Message team"
              value={draft}
              onChange={setDraft}
            />
            <Button type="submit" size="sm">
              Send
            </Button>
          </form>
        : undefined
      }
    >
      {commentsPanel ?
        visibleComments.map((comment) => (
          <SpatialCanvasCommentThread
            key={comment.id}
            initials={initials(comment.author)}
            author={comment.author}
            body={comment.body}
            resolved={comment.resolved}
            selected={comment.id === activeCommentId}
            onSelect={() => onSelectComment(comment.id)}
            onToggleResolved={() => onToggleComment(comment.id)}
          />
        ))
      : messages.map((message) => (
          <article key={message.id}>
            <strong>{message.author}</strong>
            <p>{message.body}</p>
          </article>
        ))
      }
    </SpatialCanvasSidePanel>
  )
}
