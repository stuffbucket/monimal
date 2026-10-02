import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import { createYProjectMapStore } from "../src/store.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Yjs project map store", () => {
  it("isolates pages and synchronizes document updates", () => {
    const first = createYProjectMapStore()
    const second = createYProjectMapStore()
    const page = first.addPage("Architecture")
    const notes = first.addPage("Notes")
    first.renameProject("Repository planning")
    first.renamePage(page.id, "System architecture")
    first.movePage(notes.id, page.id)

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
    expect(second.getSnapshot("projects").projectName).toBe(
      "Repository planning",
    )
    expect(second.getSnapshot("projects").pages).toEqual([
      { id: "projects", name: "Page 1" },
      { id: notes.id, name: "Notes" },
      { id: page.id, name: "System architecture" },
    ])

    first.destroy()
    second.destroy()
  })

  it("starts with an editable project and page when no state exists", () => {
    const store = createYProjectMapStore()

    expect(store.getSnapshot("projects")).toMatchObject({
      projectName: "Untitled project",
      items: [],
      comments: [],
      messages: [],
      presence: [],
      pages: [{ id: "projects", name: "Page 1" }],
    })

    const second = store.addPage()
    expect(second).toMatchObject({ name: "Page 2" })
    const third = store.addPage()
    expect(third).toMatchObject({ name: "Page 3" })
    expect(store.getSnapshot("projects").pages).toEqual([
      { id: "projects", name: "Page 1" },
      { id: second.id, name: "Page 2" },
      { id: third.id, name: "Page 3" },
    ])
    expect(store.getSnapshot(second.id)).toMatchObject({
      items: [],
      comments: [],
      messages: [],
    })

    store.destroy()
  })
})

describe("Yjs project map edits", () => {
  it("preserves canonical document state and repairs malformed page reads", () => {
    const document = new Y.Doc()
    const pages = document.getMap<unknown>("project-map-pages")
    const metadata = document.getMap<unknown>("project-map-metadata")
    pages.set("projects", {
      name: "Existing page",
      items: [],
      comments: [],
      messages: [],
    })
    pages.set("broken", null)
    pages.set("partial", {
      name: 42,
      items: "invalid",
      comments: "invalid",
      messages: "invalid",
    })
    metadata.set("name", "Existing project")
    metadata.set("pageOrder", ["missing", "partial", "projects"])

    const store = createYProjectMapStore({ document })

    expect(store.getSnapshot("projects")).toMatchObject({
      projectName: "Existing project",
      pages: [
        { id: "partial", name: "Untitled page" },
        { id: "projects", name: "Existing page" },
        { id: "broken", name: "Untitled page" },
      ],
    })
    expect(store.getSnapshot("broken")).toMatchObject({
      items: [],
      comments: [],
      messages: [],
    })
    expect(store.getSnapshot("partial")).toMatchObject({
      items: [],
      comments: [],
      messages: [],
    })

    store.destroy()
  })

  it("normalizes names and leaves invalid edits and moves unchanged", () => {
    const store = createYProjectMapStore()
    const second = store.addPage("Second")
    const third = store.addPage("Third")

    store.renameProject("  Renamed project  ")
    store.renamePage(second.id, "  Renamed page  ")
    expect(store.getSnapshot("projects")).toMatchObject({
      projectName: "Renamed project",
      pages: [
        { id: "projects", name: "Page 1" },
        { id: second.id, name: "Renamed page" },
        { id: third.id, name: "Third" },
      ],
    })

    store.renameProject(" ")
    store.renamePage(second.id, " ")
    store.renamePage("missing", "Missing")
    const unchanged = () =>
      store.getSnapshot("projects").pages.map(({ id }) => id)
    store.movePage(third.id, third.id)
    expect(unchanged()).toEqual(["projects", second.id, third.id])
    store.movePage("missing", second.id)
    expect(unchanged()).toEqual(["projects", second.id, third.id])
    store.movePage(third.id, "missing")
    expect(unchanged()).toEqual(["projects", second.id, third.id])
    expect(store.getSnapshot("projects")).toMatchObject({
      projectName: "Renamed project",
      pages: [
        { id: "projects", name: "Page 1" },
        { id: second.id, name: "Renamed page" },
        { id: third.id, name: "Third" },
      ],
    })

    store.movePage(third.id, second.id)
    expect(store.getSnapshot("projects").pages.map(({ id }) => id)).toEqual([
      "projects",
      third.id,
      second.id,
    ])
    store.movePage("projects", second.id)
    expect(store.getSnapshot("projects").pages.map(({ id }) => id)).toEqual([
      third.id,
      "projects",
      second.id,
    ])
    const fourth = store.addPage("Fourth")
    expect(store.getSnapshot("projects").pages.map(({ id }) => id)).toEqual([
      third.id,
      "projects",
      second.id,
      fourth.id,
    ])
    store.destroy()
  })

  it("orders pages without existing metadata and avoids generated id collisions", () => {
    vi.spyOn(Date, "now").mockReturnValue(123)
    const document = new Y.Doc()
    const pages = document.getMap<unknown>("project-map-pages")
    pages.set("page-3f-1", {
      name: "Reserved",
      items: [],
      comments: [],
      messages: [],
    })
    const store = createYProjectMapStore({ document })

    store.movePage("projects", "page-3f-1")
    expect(store.getSnapshot("projects").pages.map(({ id }) => id)).toEqual([
      "projects",
      "page-3f-1",
    ])
    document.getMap<unknown>("project-map-metadata").set("pageOrder", "invalid")
    store.movePage("page-3f-1", "projects")
    expect(store.getSnapshot("projects").pages.map(({ id }) => id)).toEqual([
      "page-3f-1",
      "projects",
    ])

    const added = store.addPage()
    expect(added.id).toBe("page-3f-2")
    expect(store.getSnapshot("projects").pages.map(({ id }) => id)).toEqual([
      "page-3f-1",
      "projects",
      "page-3f-2",
    ])
    store.destroy()
  })

  it("notifies subscribers for page and metadata changes until unsubscribed", () => {
    const store = createYProjectMapStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    const page = store.addPage("Second")
    store.renameProject("Renamed")
    store.renamePage(page.id, "Renamed page")
    store.movePage(page.id, "projects")
    expect(listener).toHaveBeenCalledTimes(4)

    unsubscribe()
    store.renameProject("After unsubscribe")
    expect(listener).toHaveBeenCalledTimes(4)
    store.destroy()
  })
})

describe("Yjs project map presence", () => {
  it("tracks independent participant views through Awareness", () => {
    const store = createYProjectMapStore()
    const page = store.addPage("Other page")
    const participant = {
      id: "agent-1",
      name: "Planner",
      initials: "PL",
      color: "#8b5cf6",
      kind: "agent" as const,
      pageId: "projects",
      cursorState: "text" as const,
      selectedIds: ["project:one"],
    }

    const listener = vi.fn()
    store.subscribe(listener)
    store.updatePresence("overview", participant)
    expect(listener).toHaveBeenCalledOnce()
    store.updatePresence("detail", {
      ...participant,
      pageId: page.id,
      selectedIds: [],
    })

    expect(
      store.getSnapshot("projects").presence.map((view) => view.viewId),
    ).toEqual(["overview"])
    expect(
      store.getSnapshot(page.id).presence.map((view) => view.viewId),
    ).toEqual(["detail"])
    expect(store.getSnapshot("projects").presence[0]?.cursorState).toBe("text")

    store.removePresence("overview")
    expect(store.getSnapshot("projects").presence).toEqual([])
    store.destroy()
  })
})
