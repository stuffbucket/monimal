import {
  SpatialCanvas,
  SpatialCanvasCommentPin,
  SpatialCanvasConnectorLayer,
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

import {
  connectorSegment,
  itemRectangle,
  rectanglesIntersect,
  type Rectangle,
} from "./geometry.ts"
import {
  arrowDelta,
  newItemDefinition,
  PROJECT_MAP_TOOLS,
  selectionAfterPointer,
  type ProjectMapDragState,
  type ProjectMapPendingMove,
} from "./interaction.ts"
import {
  layoutProjects,
  type ProjectMapProject,
  type ProjectMapTool,
  type SceneItem,
} from "./model.ts"
import { ProjectMapChrome } from "./ProjectMapChrome.tsx"
import { ProjectMapCommentPlacement } from "./ProjectMapCommentPlacement.tsx"
import {
  commentInitials,
  commentPosition,
  ProjectMapActiveComment,
} from "./ProjectMapComments.tsx"
import { projectMapCursorState } from "./ProjectMapPresence.tsx"
import { ProjectMapPresenceCursors } from "./ProjectMapPresenceCursors.tsx"
import { useProjectMapComments } from "./useProjectMapComments.ts"
import {
  clampZoom,
  editableTarget,
  INITIAL_CAMERA,
  screenToWorld,
  useRafCamera,
  wheelZoomFactor,
  type Point,
} from "./view.ts"
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
  const panelId = `${generatedViewId}-panel`
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<ProjectMapDragState | undefined>(undefined)
  const pendingMove = useRef<ProjectMapPendingMove | undefined>(undefined)
  const moveFrame = useRef<number | undefined>(undefined)
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
  const {
    projectName,
    items,
    comments,
    messages,
    pages,
    presence: collaborators,
  } = snapshot
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
  const flushMove = useCallback(() => {
    if (moveFrame.current !== undefined) {
      cancelAnimationFrame(moveFrame.current)
      moveFrame.current = undefined
    }
    const pending = pendingMove.current
    pendingMove.current = undefined
    if (!pending) return
    setItems((current) =>
      current.map((item) => {
        const origin = pending.itemOrigins.get(item.id)
        return origin && "x" in item ?
            { ...item, x: origin.x + pending.dx, y: origin.y + pending.dy }
          : item
      }),
    )
  }, [setItems])
  const scheduleMove = useCallback(
    (next: ProjectMapPendingMove) => {
      pendingMove.current = next
      if (moveFrame.current !== undefined) return
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = undefined
        flushMove()
      })
    },
    [flushMove],
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
      cursorState: projectMapCursorState(tool, undefined, chatOpen),
      selectedIds: [...selected],
      ...(cursor.current ? { cursor: cursor.current } : {}),
    })
  }, [chatOpen, pageId, selected, store, tool, viewId, viewer])

  useEffect(() => () => store.removePresence(viewId), [store, viewId])

  useEffect(
    () => () => {
      if (moveFrame.current !== undefined)
        cancelAnimationFrame(moveFrame.current)
    },
    [],
  )

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
  const nextCommentId = useCallback(
    (kind: "comment" | "reply") => `${kind}:${++nextId.current}`,
    [],
  )
  const {
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
  } = useProjectMapComments({
    comments,
    viewer,
    updatePage,
    nextId: nextCommentId,
    onPosted: () => setCommentsOpen(true),
  })

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
      zoomAt(wheelZoomFactor(event.deltaY), {
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
    if (tool === "comment") {
      setCommentDraft({ ...world, body: "" })
      setTool("select")
      return
    }
    if (tool !== "sticky" && tool !== "shape" && tool !== "section") return
    const id = `local:${++nextId.current}`
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
    event: PointerEvent<HTMLButtonElement>,
    item: SceneItem,
  ) => {
    if (item.type === "connector" || tool === "hand") return
    event.stopPropagation()
    if (tool === "comment" && "x" in item) {
      const bounds = viewport.current?.getBoundingClientRect()
      if (!bounds) return
      const world = screenToWorld(
        { x: event.clientX, y: event.clientY },
        camera,
        bounds,
      )
      setCommentDraft({
        ...world,
        body: "",
        anchor: {
          itemId: item.id,
          offsetX: world.x - item.x,
          offsetY: world.y - item.y,
        },
      })
      setTool("select")
      return
    }
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
      cursorState: projectMapCursorState(tool, drag.current?.mode, chatOpen),
      selectedIds: [...selected],
    })
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
    scheduleMove({ itemOrigins: active.itemOrigins, dx, dy })
  }

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.mode === "move") flushMove()
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
    store.updatePresence(viewId, {
      ...viewer,
      pageId,
      ...(cursor.current ? { cursor: cursor.current } : {}),
      cursorState: projectMapCursorState(tool, undefined, chatOpen),
      selectedIds: [...selected],
    })
  }

  const clearPointerPresence = () => {
    cursor.current = undefined
    store.updatePresence(viewId, {
      ...viewer,
      pageId,
      cursorState: projectMapCursorState(tool, undefined, chatOpen),
      selectedIds: [...selected],
    })
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

  // eslint-disable-next-line complexity
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editableTarget(event.target)) return
    const lower = event.key.toLowerCase()
    const shortcut = PROJECT_MAP_TOOLS.find((entry) =>
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
        setItems((current) => {
          const removed = new Set(
            current
              .filter(
                (item) => item.type !== "project" && selected.has(item.id),
              )
              .map((item) => item.id),
          )
          return current.filter(
            (item) =>
              !removed.has(item.id)
              && (item.type !== "connector"
                || (!removed.has(item.fromId) && !removed.has(item.toId))),
          )
        })
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
        ...connectorSegment(from, to),
      },
    ]
  })

  return (
    <TooltipProvider>
      <SpatialCanvas testId="project-map">
        <ProjectMapChrome
          panelId={panelId}
          query={query}
          onQueryChange={onQueryChange}
          projects={projects}
          busy={busy}
          onOpenProject={onOpenProject}
          projectName={projectName}
          onProjectRename={(name) => store.renameProject(name)}
          pages={pages}
          pageId={pageId}
          onPageChange={onPageChange}
          onAddPage={() => onPageChange(store.addPage().id)}
          onPageRename={(id, name) => store.renamePage(id, name)}
          onPageMove={(id, targetId) => store.movePage(id, targetId)}
          presence={collaborators}
          comments={comments}
          {...(activeCommentId ? { activeCommentId } : {})}
          onSelectComment={setActiveCommentId}
          messages={messages}
          commentsOpen={commentsOpen}
          onCommentsOpenChange={setCommentsOpen}
          chatOpen={chatOpen}
          onChatOpenChange={setChatOpen}
          onAddFolder={onAddFolder}
          tools={PROJECT_MAP_TOOLS}
          tool={tool}
          onToolChange={setTool}
          onOpenSettings={onOpenSettings}
          {...(error ? { error } : {})}
          zoom={camera.zoom}
          onZoom={zoomAt}
          onResetCamera={() => scheduleCamera(INITIAL_CAMERA)}
          onToggleComment={toggleComment}
          onDeleteComment={deleteComment}
          onAddComment={(body) =>
            updatePage((draft) => {
              draft.comments.push({
                id: `comment:${++nextId.current}`,
                author: viewer.name,
                authorId: viewer.id,
                authorInitials: viewer.initials,
                authorColor: viewer.color,
                body,
                createdAt: new Date().toISOString(),
                x: (-camera.x + viewportSize.width / 2) / camera.zoom,
                y: (-camera.y + viewportSize.height / 2) / camera.zoom,
                replies: [],
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
          id={panelId}
          tool={tool}
          gridCamera={camera}
          tabIndex={0}
          role="tabpanel"
          aria-label="Project map canvas"
          onWheel={onWheel}
          onPointerDown={beginCanvasPointer}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={clearPointerPresence}
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
                const meta =
                  !item.project.trusted || !item.project.available ?
                    `${item.project.kind}${
                      !item.project.trusted ? " · Restricted mode" : ""
                    }${!item.project.available ? " · missing" : ""}`
                  : undefined
                return (
                  <SpatialCanvasProjectCard
                    key={item.id}
                    selected={isSelected}
                    connectionMode={tool === "connector"}
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
                    {...(meta ? { meta } : {})}
                  />
                )
              }
              return (
                <SpatialCanvasItem
                  key={item.id}
                  kind={item.type}
                  label={item.text}
                  selected={isSelected}
                  connectionMode={tool === "connector"}
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
              .map((comment) =>
                (() => {
                  const position = commentPosition(comment, itemById)
                  return (
                    <SpatialCanvasCommentPin
                      key={comment.id}
                      x={position.x}
                      y={position.y}
                      label={`Comment by ${comment.author}: ${comment.body}`}
                      selected={comment.id === activeCommentId}
                      onClick={() => {
                        setActiveCommentId(comment.id)
                        setReplyDraft("")
                        setCommentsOpen(true)
                      }}
                    >
                      {comment.authorInitials
                        ?? commentInitials(comment.author)}
                    </SpatialCanvasCommentPin>
                  )
                })(),
              )}
            <ProjectMapPresenceCursors
              collaborators={collaborators}
              viewId={viewId}
            />
            {marquee ?
              <SpatialCanvasMarquee {...marquee} />
            : null}
          </SpatialCanvasScene>
          <ProjectMapCommentPlacement
            tool={tool}
            cursor={cursor.current}
            camera={camera}
            color={viewer.color}
            draft={
              commentDraft ?
                {
                  ...commentDraft,
                  ...commentPosition(commentDraft, itemById),
                }
              : undefined
            }
            onDraftChange={setCommentDraft}
            onSubmit={submitCommentDraft}
            onCancel={() => setCommentDraft(undefined)}
          />
          {activeComment ?
            <ProjectMapActiveComment
              comment={activeComment}
              position={commentPosition(activeComment, itemById)}
              camera={camera}
              viewportWidth={viewportSize.width}
              viewportHeight={viewportSize.height}
              viewer={viewer}
              reply={replyDraft}
              onReplyChange={setReplyDraft}
              onSubmitReply={submitReply}
              onToggleResolved={() => toggleComment(activeComment.id)}
              onDelete={() => deleteComment(activeComment.id)}
              onClose={() => {
                setActiveCommentId(undefined)
                setReplyDraft("")
              }}
            />
          : null}
        </SpatialCanvasViewport>
      </SpatialCanvas>
    </TooltipProvider>
  )
}
