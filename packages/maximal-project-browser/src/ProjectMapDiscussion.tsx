import {
  Button,
  SpatialCanvasSidePanel,
  TextInput,
} from "@maximal/maximal-electron/renderer"
import { useState } from "react"

import type { ProjectMapComment, ProjectMapMessage } from "./model.ts"

export function ProjectMapDiscussion({
  kind,
  comments,
  messages,
  onClose,
  onToggleComment,
  onSubmit,
}: {
  kind: "comments" | "chat"
  comments: Array<ProjectMapComment>
  messages: Array<ProjectMapMessage>
  onClose: () => void
  onToggleComment: (commentId: string) => void
  onSubmit: (body: string) => void
}) {
  const [draft, setDraft] = useState("")
  const commentsPanel = kind === "comments"
  const title = commentsPanel ? "Comments" : "Team chat"

  return (
    <SpatialCanvasSidePanel
      label={title}
      title={title}
      onClose={onClose}
      footer={
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
            aria-label={commentsPanel ? "Add comment" : "Message team"}
            value={draft}
            onChange={setDraft}
          />
          <Button type="submit" size="sm">
            Send
          </Button>
        </form>
      }
    >
      {commentsPanel ?
        comments.map((comment) => (
          <article key={comment.id} data-resolved={comment.resolved}>
            <strong>{comment.author}</strong>
            <p>{comment.body}</p>
            <Button size="sm" onClick={() => onToggleComment(comment.id)}>
              {comment.resolved ? "Reopen" : "Resolve"}
            </Button>
          </article>
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
