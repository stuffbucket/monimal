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
  selectedIds: Array<string>
}

export interface ProjectMapPage {
  id: string
  name: string
}

export interface ProjectMapPageSnapshot {
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

function clone<T>(value: T): T {
  return structuredClone(value)
}

function pageValue(value: unknown): StoredPage {
  if (!value || typeof value !== "object") {
    return { name: "Projects", items: [], comments: [], messages: [] }
  }
  const page = value as Partial<StoredPage>
  return {
    name: typeof page.name === "string" ? page.name : "Projects",
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
  initialPage = { id: "projects", name: "Projects" },
}: {
  document?: Y.Doc
  awareness?: Awareness
  initialPage?: ProjectMapPage
} = {}): ProjectMapStore {
  const pages = document.getMap<StoredPage>("project-map-pages")
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
      return {
        pages: [...pages.entries()].map(([id, value]) => ({
          id,
          name: pageValue(value).name,
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
    addPage(name = "Untitled") {
      let id: string
      do {
        id = `page-${Date.now().toString(36)}-${(++pageSequence).toString(36)}`
      } while (pages.has(id))
      pages.set(id, { name, items: [], comments: [], messages: [] })
      return { id, name }
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
      awareness.off("change", notify)
      awareness.destroy()
      document.destroy()
      listeners.clear()
    },
  }
}
