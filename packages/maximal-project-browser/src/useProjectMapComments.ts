import { useState } from "react"

import type { ProjectMapComment } from "./model.ts"
import type { ProjectMapCommentDraft } from "./ProjectMapCommentComposer.tsx"
import type { ProjectMapPageDraft, ProjectMapViewer } from "./store.ts"

export function useProjectMapComments({
  comments,
  viewer,
  updatePage,
  nextId,
  onPosted,
}: {
  comments: Array<ProjectMapComment>
  viewer: ProjectMapViewer
  updatePage: (update: (draft: ProjectMapPageDraft) => void) => void
  nextId: (kind: "comment" | "reply") => string
  onPosted: () => void
}) {
  const [activeCommentId, setActiveCommentId] = useState<string>()
  const [commentDraft, setCommentDraft] = useState<ProjectMapCommentDraft>()
  const [replyDraft, setReplyDraft] = useState("")
  const activeComment = comments.find(
    (comment) => comment.id === activeCommentId,
  )

  const submitCommentDraft = () => {
    if (!commentDraft) return
    const body = commentDraft.body.trim()
    if (!body) return
    const id = nextId("comment")
    updatePage((draft) => {
      draft.comments.push({
        id,
        author: viewer.name,
        authorId: viewer.id,
        authorInitials: viewer.initials,
        authorColor: viewer.color,
        body,
        createdAt: new Date().toISOString(),
        x: commentDraft.x,
        y: commentDraft.y,
        ...(commentDraft.anchor ? { anchor: commentDraft.anchor } : {}),
        replies: [],
        resolved: false,
      })
    })
    setActiveCommentId(id)
    setCommentDraft(undefined)
    onPosted()
  }

  const toggleComment = (commentId: string) =>
    updatePage((draft) => {
      draft.comments = draft.comments.map((entry) =>
        entry.id === commentId ?
          { ...entry, resolved: !entry.resolved }
        : entry,
      )
    })

  const deleteComment = (commentId: string) => {
    updatePage((draft) => {
      draft.comments = draft.comments.filter((entry) => entry.id !== commentId)
    })
    if (activeCommentId === commentId) setActiveCommentId(undefined)
  }

  const submitReply = () => {
    if (!activeComment) return
    const body = replyDraft.trim()
    if (!body) return
    updatePage((draft) => {
      draft.comments = draft.comments.map((comment) =>
        comment.id === activeComment.id ?
          {
            ...comment,
            replies: [
              ...(comment.replies ?? []),
              {
                id: nextId("reply"),
                author: viewer.name,
                authorId: viewer.id,
                authorInitials: viewer.initials,
                authorColor: viewer.color,
                body,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : comment,
      )
    })
    setReplyDraft("")
  }

  return {
    activeComment,
    activeCommentId,
    commentDraft,
    deleteComment,
    replyDraft,
    setActiveCommentId,
    setCommentDraft,
    setReplyDraft,
    submitCommentDraft,
    submitReply,
    toggleComment,
  }
}
