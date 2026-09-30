import {
  SpatialCanvas,
  SpatialCanvasCommentPin,
  SpatialCanvasConnectorLayer,
  SpatialCanvasCursor,
  SpatialCanvasItem,
  SpatialCanvasMarquee,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasViewport,
  TooltipProvider,
} from "@maximal/maximal-electron/renderer"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react"

import type {
  ProjectMapPageDraft,
  ProjectMapStore,
  ProjectMapViewer,
} from "./store.ts"

import { rectanglesIntersect, type Rectangle } from "./geometry.ts"
import {
  arrowDelta,
  newItemDefinition,
  selectionAfterPointer,
} from "./interaction.ts"
import {
  layoutProjects,
  type ProjectMapProject,
  type ProjectMapTool,
  type SceneItem,
} from "./model.ts"
import { ProjectMapChrome } from "./ProjectMapChrome.tsx"

interface Camera {
  x: number
  y: number
  zoom: number
}

interface Point {
  x: number
  y: number
}

interface DragState {
  mode: "pan" | "move" | "marquee"
  pointerId: number
  origin: Point
  camera: Camera
  worldOrigin: Point
  itemOrigins: Map<string, Point>
}

export interface ProjectMapProps {
  projects: Array<ProjectMapProject>
  query: string
  onQueryChange: (query: string) => void
  onOpenProject: (project: ProjectMapProject) => void
  onOpenSettings: () => void
  onAddFolder: () => void
  busy?: boolean
  error?: string
  store: ProjectMapStore
  pageId: string
  onPageChange: (pageId: string) => void
  viewer: ProjectMapViewer
  viewId?: string
}

const TOOL_LABELS: ReadonlyArray<{
  tool: ProjectMapTool
  label: string
  shortcut: string
}> = [
  { tool: "select", label: "Move", shortcut: "V" },
  { tool: "hand", label: "Hand", shortcut: "H" },
  { tool: "sticky", label: "Sticky note", shortcut: "S" },
  { tool: "shape", label: "Shape", shortcut: "O" },
  { tool: "section", label: "Section", shortcut: "⇧S" },
  { tool: "connector", label: "Connector", shortcut: "L" },
  { tool: "comment", label: "Comment", shortcut: "C" },
]

const INITIAL_CAMERA = { x: 340, y: 100, zoom: 1 } as const

function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.1, value))
}

function itemRectangle(item: SceneItem): Rectangle | undefined {
  return "x" in item ?
      { x: item.x, y: item.y, width: item.width, height: item.height }
    : undefined
}

function screenToWorld(point: Point, camera: Camera, bounds: DOMRect): Point {
  return {
    x: (point.x - bounds.left - camera.x) / camera.zoom,
    y: (point.y - bounds.top - camera.y) / camera.zoom,
  }
}

function editableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
  )
}

function useRafCamera(initial: Camera): [Camera, (next: Camera) => void] {
  const [camera, setCamera] = useState(initial)
  const pending = useRef<Camera | undefined>(undefined)
  const frame = useRef<number | undefined>(undefined)

  const schedule = useCallback((next: Camera) => {
    pending.current = next
    if (frame.current !== undefined) return
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      if (pending.current) setCamera(pending.current)
    })
  }, [])

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    },
    [],
  )

  return [camera, schedule]
}

// The coordinator intentionally keeps gesture state and scene rendering in one component.
// eslint-disable-next-line max-lines-per-function
export function ProjectMap({
  projects,
  query,
  onQueryChange,
  onOpenProject,
  onOpenSettings,
  onAddFolder,
  busy = false,
  error,
  store,
  pageId,
  onPageChange,
  viewer,
  viewId: providedViewId,
}: ProjectMapProps) {
  const generatedViewId = useId()
  const viewId = providedViewId ?? generatedViewId
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | undefined>(undefined)
  const nextId = useRef(0)
  const connectorStart = useRef<string | undefined>(undefined)
  const cursor = useRef<Point | undefined>(undefined)
  const [storeRevision, setStoreRevision] = useState(0)
  const [camera, scheduleCamera] = useRafCamera(INITIAL_CAMERA)
  const [tool, setTool] = useState<ProjectMapTool>("select")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [marquee, setMarquee] = useState<Rectangle | undefined>(undefined)
  const [chatOpen, setChatOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 700 })
  const snapshot = useMemo(
    () => store.getSnapshot(pageId),
    [pageId, store, storeRevision],
  )
  const { items, comments, messages, pages, presence: collaborators } = snapshot
  const updatePage = useCallback(
    (update: (draft: ProjectMapPageDraft) => void) =>
      store.transact(pageId, update),
    [pageId, store],
  )
  const setItems = useCallback(
    (update: (items: Array<SceneItem>) => Array<SceneItem>) => {
      updatePage((draft) => {
        draft.items = update(draft.items)
      })
    },
    [updatePage],
  )

  useEffect(
    () => store.subscribe(() => setStoreRevision((value) => value + 1)),
    [store],
  )

  useEffect(() => {
    setItems((current) => {
      const currentProjects = new Map(
        current
          .filter(
            (item): item is Extract<SceneItem, { type: "project" }> =>
              item.type === "project",
          )
          .map((item) => [item.project.id, item]),
      )
      const projectItems = layoutProjects(projects).map((item) => {
        if (item.type !== "project") return item
        const existing = currentProjects.get(item.project.id)
        return existing ? { ...existing, project: item.project } : item
      })
      return [
        ...current.filter((item) => item.type !== "project"),
        ...projectItems,
      ]
    })
  }, [projects, setItems])

  useEffect(() => {
    store.updatePresence(viewId, {
      ...viewer,
      pageId,
      selectedIds: [...selected],
      ...(cursor.current ? { cursor: cursor.current } : {}),
    })
  }, [pageId, selected, store, viewId, viewer])

  useEffect(() => () => store.removePresence(viewId), [store, viewId])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const update = () =>
      setViewportSize({
        width: element.clientWidth || 1200,
        height: element.clientHeight || 700,
      })
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const visibleBounds = useMemo<Rectangle>(
    () => ({
      x: -camera.x / camera.zoom - 320,
      y: -camera.y / camera.zoom - 320,
      width: viewportSize.width / camera.zoom + 640,
      height: viewportSize.height / camera.zoom + 640,
    }),
    [camera, viewportSize],
  )

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const rectangle = itemRectangle(item)
        return (
          rectangle === undefined
          || rectanglesIntersect(rectangle, visibleBounds)
        )
      }),
    [items, visibleBounds],
  )

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )

  const zoomAt = useCallback(
    (factor: number, point?: Point) => {
      const bounds = viewport.current?.getBoundingClientRect()
      if (!bounds) return
      const anchor = point ?? {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      }
      const world = screenToWorld(anchor, camera, bounds)
      const zoom = clampZoom(camera.zoom * factor)
      scheduleCamera({
        zoom,
        x: anchor.x - bounds.left - world.x * zoom,
        y: anchor.y - bounds.top - world.y * zoom,
      })
    },
    [camera, scheduleCamera],
  )

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      zoomAt(Math.exp(-event.deltaY * 0.002), {
        x: event.clientX,
        y: event.clientY,
      })
      return
    }
    scheduleCamera({
      ...camera,
      x: camera.x - event.deltaX,
      y: camera.y - event.deltaY,
    })
  }

  const createAt = (world: Point) => {
    const id = `local:${++nextId.current}`
    if (tool === "comment") {
      updatePage((draft) => {
        draft.comments.push({
          id,
          author: viewer.name,
          body: "New comment",
          x: world.x,
          y: world.y,
          resolved: false,
        })
      })
      setCommentsOpen(true)
      setTool("select")
      return
    }
    if (tool !== "sticky" && tool !== "shape" && tool !== "section") return
    const definition = newItemDefinition(tool)
    setItems((current) => [
      ...current,
      {
        id,
        type: tool,
        x: world.x,
        y: world.y,
        width: definition.width,
        height: definition.height,
        text: definition.text,
      },
    ])
    setSelected(new Set([id]))
    setTool("select")
  }

  const beginCanvasPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX, y: event.clientY }
    const world = screenToWorld(point, camera, bounds)
    if (tool !== "select" && tool !== "hand") {
      createAt(world)
      return
    }
    const pan = tool === "hand" || event.button === 1
    drag.current = {
      mode: pan ? "pan" : "marquee",
      pointerId: event.pointerId,
      origin: point,
      camera,
      worldOrigin: world,
      itemOrigins: new Map(),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!pan) {
      if (!event.shiftKey) setSelected(new Set())
      setMarquee({ x: world.x, y: world.y, width: 0, height: 0 })
    }
  }

  const beginItemPointer = (
    event: PointerEvent<HTMLElement>,
    item: SceneItem,
  ) => {
    if (item.type === "connector" || tool === "hand") return
    event.stopPropagation()
    if (tool === "connector") {
      const start = connectorStart.current
      if (start && start !== item.id) {
        setItems((current) => [
          ...current,
          {
            id: `local:${++nextId.current}`,
            type: "connector",
            fromId: start,
            toId: item.id,
          },
        ])
        connectorStart.current = undefined
        setTool("select")
      } else {
        connectorStart.current = item.id
        setSelected(new Set([item.id]))
      }
      return
    }
    if (tool !== "select") return
    const nextSelection = selectionAfterPointer(
      selected,
      item.id,
      event.shiftKey,
    )
    setSelected(nextSelection)
    const bounds = viewport.current?.getBoundingClientRect()
    if (!bounds) return
    drag.current = {
      mode: "move",
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      camera,
      worldOrigin: screenToWorld(
        { x: event.clientX, y: event.clientY },
        camera,
        bounds,
      ),
      itemOrigins: new Map(
        items.flatMap((candidate) =>
          nextSelection.has(candidate.id) && "x" in candidate ?
            [[candidate.id, { x: candidate.x, y: candidate.y }] as const]
          : [],
        ),
      ),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.mode === "pan") {
      scheduleCamera({
        ...active.camera,
        x: active.camera.x + event.clientX - active.origin.x,
        y: active.camera.y + event.clientY - active.origin.y,
      })
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const world = screenToWorld(
      { x: event.clientX, y: event.clientY },
      camera,
      bounds,
    )
    cursor.current = world
    store.updatePresence(viewId, {
      ...viewer,
      pageId,
      cursor: world,
      selectedIds: [...selected],
    })
    if (active.mode === "marquee") {
      setMarquee({
        x: Math.min(active.worldOrigin.x, world.x),
        y: Math.min(active.worldOrigin.y, world.y),
        width: Math.abs(world.x - active.worldOrigin.x),
        height: Math.abs(world.y - active.worldOrigin.y),
      })
      return
    }
    const dx = world.x - active.worldOrigin.x
    const dy = world.y - active.worldOrigin.y
    setItems((current) =>
      current.map((item) => {
        const origin = active.itemOrigins.get(item.id)
        return origin && "x" in item ?
            { ...item, x: origin.x + dx, y: origin.y + dy }
          : item
      }),
    )
  }

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.mode === "marquee" && marquee) {
      setSelected(
        new Set(
          items
            .filter((item) => {
              const rectangle = itemRectangle(item)
              return rectangle && rectanglesIntersect(rectangle, marquee)
            })
            .map((item) => item.id),
        ),
      )
    }
    drag.current = undefined
    setMarquee(undefined)
  }

  const nudgeSelection = (dx: number, dy: number) => {
    setItems((current) =>
      current.map((item) =>
        selected.has(item.id) && "x" in item ?
          { ...item, x: item.x + dx, y: item.y + dy }
        : item,
      ),
    )
  }

  // Keyboard dispatch is one interaction model even though it has many key branches.
  // eslint-disable-next-line complexity
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editableTarget(event.target)) return
    const lower = event.key.toLowerCase()
    const shortcut = TOOL_LABELS.find((entry) =>
      entry.shortcut === "⇧S" ?
        event.shiftKey && lower === "s"
      : !event.shiftKey && entry.shortcut.toLowerCase() === lower,
    )
    if (shortcut) {
      event.preventDefault()
      setTool(shortcut.tool)
      return
    }
    switch (event.key) {
      case "+":
      case "=": {
        event.preventDefault()
        zoomAt(1.2)

        break
      }
      case "-": {
        event.preventDefault()
        zoomAt(1 / 1.2)

        break
      }
      case "0": {
        event.preventDefault()
        scheduleCamera({ x: 120, y: 100, zoom: 1 })

        break
      }
      case "Escape": {
        connectorStart.current = undefined
        setSelected(new Set())
        setTool("select")

        break
      }
      case "Backspace":
      case "Delete": {
        setItems((current) =>
          current.filter(
            (item) => item.type === "project" || !selected.has(item.id),
          ),
        )
        setSelected(new Set())

        break
      }
      default: {
        if (event.key.startsWith("Arrow")) {
          event.preventDefault()
          const amount = event.shiftKey ? 10 : 1
          const delta = arrowDelta(event.key, amount)
          nudgeSelection(delta.x, delta.y)
        } else if (event.key === "Enter" && selected.size === 1) {
          const item = itemById.get([...selected][0] ?? "")
          if (
            item?.type === "project"
            && item.project.available
            && item.project.trusted
          ) {
            onOpenProject(item.project)
          }
        }
      }
    }
  }

  const connectorLines = visibleItems.flatMap((item) => {
    if (item.type !== "connector") return []
    const from = itemById.get(item.fromId)
    const to = itemById.get(item.toId)
    if (!from || !to || !("x" in from) || !("x" in to)) return []
    return [
      {
        ...item,
        x1: from.x + from.width / 2,
        y1: from.y + from.height / 2,
        x2: to.x + to.width / 2,
        y2: to.y + to.height / 2,
      },
    ]
  })

  const updateSelectedText = (text: string) => {
    setItems((current) =>
      current.map((item) =>
        selected.has(item.id) && "text" in item ? { ...item, text } : item,
      ),
    )
  }

  const selectedEditable =
    selected.size === 1 ? itemById.get([...selected][0] ?? "") : undefined

  return (
    <TooltipProvider>
      <SpatialCanvas testId="project-map">
        <ProjectMapChrome
          query={query}
          onQueryChange={onQueryChange}
          pages={pages}
          pageId={pageId}
          onPageChange={onPageChange}
          onAddPage={() => onPageChange(store.addPage().id)}
          presence={collaborators}
          comments={comments}
          messages={messages}
          commentsOpen={commentsOpen}
          onCommentsOpenChange={setCommentsOpen}
          chatOpen={chatOpen}
          onChatOpenChange={setChatOpen}
          onAddFolder={onAddFolder}
          tools={TOOL_LABELS}
          tool={tool}
          onToolChange={setTool}
          projectCount={projects.length}
          onOpenSettings={onOpenSettings}
          {...(selectedEditable && "text" in selectedEditable ?
            { selectedLabel: selectedEditable.text }
          : {})}
          onSelectedLabelChange={updateSelectedText}
          {...(error ? { error } : {})}
          zoom={camera.zoom}
          onZoom={zoomAt}
          onResetCamera={() => scheduleCamera(INITIAL_CAMERA)}
          onToggleComment={(commentId) =>
            updatePage((draft) => {
              draft.comments = draft.comments.map((entry) =>
                entry.id === commentId ?
                  { ...entry, resolved: !entry.resolved }
                : entry,
              )
            })
          }
          onAddComment={(body) =>
            updatePage((draft) => {
              draft.comments.push({
                id: `comment:${++nextId.current}`,
                author: viewer.name,
                body,
                x: (-camera.x + viewportSize.width / 2) / camera.zoom,
                y: (-camera.y + viewportSize.height / 2) / camera.zoom,
                resolved: false,
              })
            })
          }
          onAddMessage={(body) =>
            updatePage((draft) => {
              draft.messages.push({
                id: `message:${++nextId.current}`,
                author: viewer.name,
                body,
              })
            })
          }
        />

        <SpatialCanvasViewport
          ref={viewport}
          tool={tool}
          tabIndex={0}
          role="application"
          aria-label="Project map canvas"
          onWheel={onWheel}
          onPointerDown={beginCanvasPointer}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onKeyDown={onKeyDown}
        >
          <SpatialCanvasScene x={camera.x} y={camera.y} zoom={camera.zoom}>
            <SpatialCanvasConnectorLayer lines={connectorLines} />
            {visibleItems.map((item) => {
              if (item.type === "connector") return null
              const isSelected = selected.has(item.id)
              if (item.type === "project") {
                const disabled =
                  busy || !item.project.available || !item.project.trusted
                return (
                  <SpatialCanvasProjectCard
                    key={item.id}
                    selected={isSelected}
                    disabled={disabled}
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    onPointerDown={(event) => beginItemPointer(event, item)}
                    onDoubleClick={() => onOpenProject(item.project)}
                    kind={item.project.kind}
                    title={item.project.name}
                    description={item.project.path}
                    meta={`${item.project.kind}${
                      !item.project.trusted ? " · Restricted mode" : ""
                    }${!item.project.available ? " · missing" : ""}`}
                  />
                )
              }
              return (
                <SpatialCanvasItem
                  key={item.id}
                  kind={item.type}
                  label={item.text}
                  selected={isSelected}
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  height={item.height}
                  onPointerDown={(event) => beginItemPointer(event, item)}
                />
              )
            })}
            {comments
              .filter((comment) => !comment.resolved)
              .map((comment, index) => (
                <SpatialCanvasCommentPin
                  key={comment.id}
                  x={comment.x}
                  y={comment.y}
                  label={`Comment ${index + 1} by ${comment.author}`}
                  onClick={() => setCommentsOpen(true)}
                >
                  {index + 1}
                </SpatialCanvasCommentPin>
              ))}
            {collaborators.flatMap((person) =>
              person.cursor ?
                [
                  <SpatialCanvasCursor
                    key={person.id}
                    x={person.cursor.x}
                    y={person.cursor.y}
                    color={person.color}
                  >
                    {person.name}
                  </SpatialCanvasCursor>,
                ]
              : [],
            )}
            {marquee ?
              <SpatialCanvasMarquee {...marquee} />
            : null}
          </SpatialCanvasScene>
        </SpatialCanvasViewport>
      </SpatialCanvas>
    </TooltipProvider>
  )
}
