import { describe, expect, it } from "vitest"

import { createYProjectMapStore } from "../src/store.ts"

describe("Yjs project map store", () => {
  it("isolates pages and synchronizes document updates", () => {
    const first = createYProjectMapStore()
    const second = createYProjectMapStore()
    const page = first.addPage("Architecture")

    first.transact(page.id, (draft) => {
      draft.messages.push({ id: "message-1", author: "Agent", body: "Mapped" })
      draft.comments.push({
        id: "comment-1",
        author: "Agent",
        body: "Keep this attached",
        createdAt: "2026-09-30T00:00:00.000Z",
        x: 24,
        y: 32,
        anchor: { itemId: "sticky-1", offsetX: 24, offsetY: 32 },
        replies: [
          {
            id: "reply-1",
            author: "Human",
            body: "Agreed",
            createdAt: "2026-09-30T00:01:00.000Z",
          },
        ],
        resolved: false,
      })
    })
    second.applyUpdate(first.encodeState())

    expect(second.getSnapshot(page.id).messages).toEqual([
      { id: "message-1", author: "Agent", body: "Mapped" },
    ])
    expect(second.getSnapshot("projects").messages).toEqual([])
    expect(second.getSnapshot(page.id).comments[0]?.replies?.[0]?.body).toBe(
      "Agreed",
    )
    expect(second.getSnapshot("projects").comments).toEqual([])

    first.destroy()
    second.destroy()
  })

  it("tracks independent participant views through Awareness", () => {
    const store = createYProjectMapStore()
    const participant = {
      id: "agent-1",
      name: "Planner",
      initials: "PL",
      color: "#8b5cf6",
      kind: "agent" as const,
      pageId: "projects",
      selectedIds: ["project:one"],
    }

    store.updatePresence("overview", participant)
    store.updatePresence("detail", { ...participant, selectedIds: [] })

    expect(
      store.getSnapshot("projects").presence.map((view) => view.viewId),
    ).toEqual(["overview", "detail"])

    store.removePresence("overview")
    expect(
      store.getSnapshot("projects").presence.map((view) => view.viewId),
    ).toEqual(["detail"])
    store.destroy()
  })
})
