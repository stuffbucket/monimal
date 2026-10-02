import type { SpatialCanvasCursorState } from "@maximal/maximal-electron/renderer"

import { Awareness } from "y-protocols/awareness"
import * as Y from "yjs"

import type {
  ProjectMapComment,
  ProjectMapMessage,
  SceneItem,
} from "./model.ts"

export type ProjectMapParticipantKind = "human" | "harness" | "agent"

export interface ProjectMapViewer {
  id: string
  name: string
  initials: string
  color: string
  kind: ProjectMapParticipantKind
}

export interface ProjectMapPresence extends ProjectMapViewer {
  viewId: string
  pageId: string
  cursor?: { x: number; y: number }
  cursorState?: SpatialCanvasCursorState
  selectedIds: Array<string>
}

export interface ProjectMapPage {
  id: string
  name: string
}

export interface ProjectMapPageSnapshot {
  projectName: string
  pages: Array<ProjectMapPage>
  items: Array<SceneItem>
  comments: Array<ProjectMapComment>
  messages: Array<ProjectMapMessage>
  presence: Array<ProjectMapPresence>
}

export interface ProjectMapPageDraft {
  items: Array<SceneItem>
  comments: Array<ProjectMapComment>
  messages: Array<ProjectMapMessage>
}

export interface ProjectMapStore {
  readonly document: Y.Doc
  readonly awareness: Awareness
  getSnapshot(pageId: string): ProjectMapPageSnapshot
  subscribe(listener: () => void): () => void
  transact(pageId: string, update: (draft: ProjectMapPageDraft) => void): void
  addPage(name?: string): ProjectMapPage
  renameProject(name: string): void
  renamePage(pageId: string, name: string): void
  movePage(pageId: string, targetPageId: string): void
  updatePresence(
    viewId: string,
    presence: Omit<ProjectMapPresence, "viewId">,
  ): void
  removePresence(viewId: string): void
  encodeState(): Uint8Array
  applyUpdate(update: Uint8Array, origin?: unknown): void
  destroy(): void
}

interface StoredPage {
  name: string
  items: Array<SceneItem>
  comments: Array<ProjectMapComment>
  messages: Array<ProjectMapMessage>
}

interface AwarenessState {
  projectMapViews?: Record<string, ProjectMapPresence>
}

interface ProjectMapMetadata {
  name: string
  pageOrder: Array<string>
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function pageValue(value: unknown): StoredPage {
  if (!value || typeof value !== "object") {
    return { name: "Untitled page", items: [], comments: [], messages: [] }
  }
  const page = value as Partial<StoredPage>
  return {
    name: typeof page.name === "string" ? page.name : "Untitled page",
    items: Array.isArray(page.items) ? clone(page.items) : [],
    comments: Array.isArray(page.comments) ? clone(page.comments) : [],
    messages: Array.isArray(page.messages) ? clone(page.messages) : [],
  }
}

// The adapter keeps the Yjs lifecycle and the public store contract atomic.
// eslint-disable-next-line max-lines-per-function
export function createYProjectMapStore({
  document = new Y.Doc(),
  awareness = new Awareness(document),
  initialPage = { id: "projects", name: "Page 1" },
  initialProjectName = "Untitled project",
}: {
  document?: Y.Doc
  awareness?: Awareness
  initialPage?: ProjectMapPage
  initialProjectName?: string
} = {}): ProjectMapStore {
  const pages = document.getMap<StoredPage>("project-map-pages")
  const metadata = document.getMap<
    ProjectMapMetadata["name"] | ProjectMapMetadata["pageOrder"]
  >("project-map-metadata")
  const listeners = new Set<() => void>()
  let pageSequence = 0

  if (!pages.has(initialPage.id)) {
    pages.set(initialPage.id, {
      name: initialPage.name,
      items: [],
      comments: [],
      messages: [],
    })
  }
  const notify = () => {
    for (const listener of listeners) listener()
  }
  pages.observeDeep(notify)
  metadata.observe(notify)
  awareness.on("change", notify)

  return {
    document,
    awareness,
    getSnapshot(pageId) {
      const page = pageValue(pages.get(pageId))
      const presence = [...awareness.getStates().values()].flatMap((state) => {
        const views = (state as AwarenessState).projectMapViews
        return views ?
            Object.values(views).filter((view) => view.pageId === pageId)
          : []
      })
      const storedOrder = metadata.get("pageOrder")
      // Stryker disable next-line ArrayDeclaration: unknown fallback IDs are filtered out below.
      const pageOrder = Array.isArray(storedOrder) ? storedOrder : []
      const orderedIds = [
        ...pageOrder.filter((id) => pages.has(id)),
        ...[...pages.keys()].filter((id) => !pageOrder.includes(id)),
      ]
      return {
        projectName:
          typeof metadata.get("name") === "string" ?
            String(metadata.get("name"))
          : initialProjectName,
        pages: orderedIds.map((id) => ({
          id,
          name: pageValue(pages.get(id)).name,
        })),
        items: page.items,
        comments: page.comments,
        messages: page.messages,
        presence,
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    transact(pageId, update) {
      document.transact(() => {
        const current = pageValue(pages.get(pageId))
        const draft = {
          items: clone(current.items),
          comments: clone(current.comments),
          messages: clone(current.messages),
        }
        update(draft)
        pages.set(pageId, { ...current, ...draft })
      }, "project-map")
    },
    addPage(name = `Page ${String(pages.size + 1)}`) {
      let id: string
      do {
        id = `page-${Date.now().toString(36)}-${(++pageSequence).toString(36)}`
      } while (pages.has(id))
      pages.set(id, { name, items: [], comments: [], messages: [] })
      return { id, name }
    },
    renameProject(name) {
      const nextName = name.trim()
      if (!nextName) return
      metadata.set("name", nextName)
    },
    renamePage(pageId, name) {
      const nextName = name.trim()
      const current = pages.get(pageId)
      if (!nextName || !current) return
      pages.set(pageId, { ...pageValue(current), name: nextName })
    },
    movePage(pageId, targetPageId) {
      if (
        pageId === targetPageId
        || !pages.has(pageId)
        || !pages.has(targetPageId)
      )
        return
      const storedOrder = metadata.get("pageOrder")
      const order = [
        // Stryker disable next-line ArrayDeclaration: unknown fallback IDs are omitted by snapshot reads.
        ...(Array.isArray(storedOrder) ? storedOrder : []),
        ...[...pages.keys()].filter(
          (id) => !Array.isArray(storedOrder) || !storedOrder.includes(id),
        ),
      ].filter((id) => id !== pageId)
      const targetIndex = order.indexOf(targetPageId)
      order.splice(targetIndex, 0, pageId)
      metadata.set("pageOrder", order)
    },
    updatePresence(viewId, presence) {
      const local = awareness.getLocalState() as AwarenessState | null
      awareness.setLocalState({
        ...local,
        projectMapViews: {
          ...local?.projectMapViews,
          [viewId]: { ...presence, viewId },
        },
      })
    },
    removePresence(viewId) {
      const local = awareness.getLocalState() as AwarenessState | null
      if (!local?.projectMapViews?.[viewId]) return
      const views = Object.fromEntries(
        Object.entries(local.projectMapViews).filter(([id]) => id !== viewId),
      )
      awareness.setLocalState({ ...local, projectMapViews: views })
    },
    encodeState() {
      return Y.encodeStateAsUpdate(document)
    },
    applyUpdate(update, origin) {
      Y.applyUpdate(document, update, origin)
    },
    destroy() {
      pages.unobserveDeep(notify)
      metadata.unobserve(notify)
      awareness.off("change", notify)
      awareness.destroy()
      document.destroy()
      listeners.clear()
    },
  }
}
