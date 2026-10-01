import { TooltipProvider } from "@maximal/maximal-electron/renderer"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectMap } from "../src/ProjectMap.tsx"
import { createYProjectMapStore, type ProjectMapStore } from "../src/store.ts"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    globalThis.setTimeout(() => callback(performance.now()), 0),
  cancelAnimationFrame: globalThis.clearTimeout,
})

Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: vi.fn(),
})

let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function requiredElement(container: ParentNode, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Expected element matching ${selector}`)
  return element
}

function typeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

function exerciseAnchoredComment({
  container,
  store,
  sticky,
  stickyId,
  viewport,
}: {
  container: HTMLElement
  store: ProjectMapStore
  sticky: HTMLElement
  stickyId: string
  viewport: HTMLElement
}): void {
  act(() => requiredElement(container, '[aria-label="Comment (C)"]').click())
  act(() => {
    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 600,
      clientY: 400,
    })
    Object.defineProperty(event, "pointerId", { value: 3 })
    sticky.dispatchEvent(event)
  })
  expect(store.getSnapshot("projects").comments).toHaveLength(0)
  const composer = requiredElement(container, '[aria-label="Add a comment"]')
  expect(composer.getAttribute("data-compact")).toBe("true")

  const comment = requiredElement(
    composer,
    '[aria-label="Comment"]',
  ) as HTMLTextAreaElement
  act(() => typeTextarea(comment, "Compact thread"))
  act(() => requiredElement(composer, '[aria-label="Post comment"]').click())

  const posted = store.getSnapshot("projects").comments[0]
  expect(posted?.body).toBe("Compact thread")
  expect(posted?.anchor?.itemId).toBe(stickyId)
  expect(posted?.createdAt).toBeTruthy()
  expect(
    container.querySelector(".spatial-canvas__comment-pin")?.textContent,
  ).toBe("MA")
  expect(
    container
      .querySelector('[aria-label="Comments"]')
      ?.getAttribute("data-edge"),
  ).toBe("true")
  expect(
    container
      .querySelector(".spatial-canvas__comment-thread")
      ?.getAttribute("data-selected"),
  ).toBe("true")

  const threadCard = requiredElement(
    container,
    '[aria-label="Comment by Map agent"]',
  )
  const reply = requiredElement(
    threadCard,
    '[aria-label="Reply to comment"]',
  ) as HTMLTextAreaElement
  act(() => typeTextarea(reply, "Following the attached note"))
  act(() => requiredElement(threadCard, '[aria-label="Post reply"]').click())
  expect(store.getSnapshot("projects").comments[0]?.replies?.[0]?.body).toBe(
    "Following the attached note",
  )

  const pinTransform = container
    .querySelector(".spatial-canvas__comment-pin")
    ?.getAttribute("style")
  act(() => {
    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 520,
      clientY: 360,
    })
    Object.defineProperty(down, "pointerId", { value: 4 })
    sticky.dispatchEvent(down)
    const move = new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 560,
      clientY: 380,
    })
    Object.defineProperty(move, "pointerId", { value: 4 })
    viewport.dispatchEvent(move)
    const up = new MouseEvent("pointerup", {
      bubbles: true,
      clientX: 560,
      clientY: 380,
    })
    Object.defineProperty(up, "pointerId", { value: 4 })
    viewport.dispatchEvent(up)
  })
  expect(
    container
      .querySelector(".spatial-canvas__comment-pin")
      ?.getAttribute("style"),
  ).not.toBe(pinTransform)

  act(() =>
    requiredElement(threadCard, '[aria-label="Resolve comment"]').click(),
  )
  expect(store.getSnapshot("projects").comments[0]?.resolved).toBe(true)
  expect(container.querySelector(".spatial-canvas__comment-pin")).toBeNull()
  expect(threadCard.getAttribute("data-resolved")).toBe("true")
}

function renderProjectMap(container: HTMLElement, store: ProjectMapStore) {
  root = createRoot(container)
  act(() => {
    root?.render(
      <TooltipProvider>
        <ProjectMap
          projects={[
            {
              id: "one",
              name: "One",
              path: "/work/one",
              kind: "repository",
              available: true,
              trusted: true,
            },
          ]}
          query=""
          onQueryChange={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenSettings={vi.fn()}
          onAddFolder={vi.fn()}
          store={store}
          pageId="projects"
          onPageChange={vi.fn()}
          viewer={{
            id: "agent",
            name: "Map agent",
            initials: "MA",
            color: "#8b5cf6",
            kind: "agent",
          }}
          viewId="agent-overview"
        />
      </TooltipProvider>,
    )
  })
}

describe("ProjectMap", () => {
  it("renders independent pages, board tools, presence, comments, and chat", () => {
    const store = createYProjectMapStore()
    const container = document.createElement("div")
    document.body.append(container)
    renderProjectMap(container, store)

    expect(container.querySelectorAll(".spatial-canvas__project")).toHaveLength(
      1,
    )
    expect(
      container.querySelector('[title="Map agent · agent"]'),
    ).not.toBeNull()
    expect(
      container.querySelector(".spatial-canvas__page-title")?.textContent,
    ).toContain("Projects")
    expect(container.querySelector('[aria-label="Pages"]')).not.toBeNull()

    const stickyTool = requiredElement(
      container,
      '[aria-label="Sticky note (S)"]',
    )
    const viewport = requiredElement(
      container,
      '[aria-label="Project map canvas"]',
    )
    act(() => stickyTool.click())
    act(() => {
      const event = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 400,
        clientY: 300,
      })
      Object.defineProperty(event, "pointerId", { value: 1 })
      viewport.dispatchEvent(event)
    })

    expect(
      store
        .getSnapshot("projects")
        .items.some((item) => item.type === "sticky"),
    ).toBe(true)

    const connectorTool = requiredElement(
      container,
      '[aria-label="Connector (L)"]',
    )
    const project = requiredElement(container, ".spatial-canvas__project")
    const sticky = requiredElement(
      container,
      '.spatial-canvas__item[data-kind="sticky"]',
    )
    act(() => connectorTool.click())
    act(() => {
      project.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      sticky.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
    })
    expect(
      container.querySelectorAll(".spatial-canvas__connectors line"),
    ).toHaveLength(1)
    expect(
      container
        .querySelector(".spatial-canvas__connectors")
        ?.getAttribute("width"),
    ).toBe("1")
    const connector = requiredElement(
      container,
      ".spatial-canvas__connectors line",
    )
    const endpointBeforeDrag = connector.getAttribute("x2")
    const stickyBeforeDrag = store
      .getSnapshot("projects")
      .items.find((item) => item.type === "sticky")
    if (!stickyBeforeDrag || !("x" in stickyBeforeDrag)) {
      throw new Error("Expected the sticky note in the project map store")
    }

    act(() => {
      const down = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 400,
        clientY: 300,
      })
      Object.defineProperty(down, "pointerId", { value: 2 })
      sticky.dispatchEvent(down)

      const move = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 520,
        clientY: 360,
      })
      Object.defineProperty(move, "pointerId", { value: 2 })
      viewport.dispatchEvent(move)

      const up = new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 520,
        clientY: 360,
      })
      Object.defineProperty(up, "pointerId", { value: 2 })
      viewport.dispatchEvent(up)
    })

    const stickyAfterDrag = store
      .getSnapshot("projects")
      .items.find((item) => item.type === "sticky")
    if (!stickyAfterDrag || !("x" in stickyAfterDrag)) {
      throw new Error("Expected the moved sticky note in the project map store")
    }
    expect(stickyAfterDrag.x).toBe(stickyBeforeDrag.x + 120)
    expect(stickyAfterDrag.y).toBe(stickyBeforeDrag.y + 60)
    expect(connector.getAttribute("x2")).not.toBe(endpointBeforeDrag)
    expect(sticky.tagName).toBe("BUTTON")
    expect(viewport.getAttribute("role")).toBe("tabpanel")

    act(() => {
      requiredElement(container, '[aria-label="Search projects"]').click()
    })
    expect(
      container.querySelector('aside[aria-label="Search projects"]'),
    ).not.toBeNull()
    expect(
      container.querySelector(".spatial-canvas__presence input"),
    ).toBeNull()
    act(() => {
      requiredElement(container, '[aria-label="Chat"]').click()
    })
    expect(
      container.querySelector('aside[aria-label="Search projects"]'),
    ).toBeNull()
    expect(container.querySelector('[aria-label="Team chat"]')).not.toBeNull()
    act(() => {
      requiredElement(container, '[aria-label="Chat"]').click()
    })

    exerciseAnchoredComment({
      container,
      store,
      sticky,
      stickyId: stickyBeforeDrag.id,
      viewport,
    })

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Chat"]')?.click()
    })
    expect(container.querySelector('[aria-label="Team chat"]')).not.toBeNull()

    act(() => root?.unmount())
    root = undefined
    store.destroy()
  })

  it("shows remote cursors without echoing or retaining the local cursor", () => {
    const store = createYProjectMapStore()
    store.updatePresence("remote-overview", {
      id: "remote",
      name: "Yav",
      initials: "YA",
      color: "#ff4f9a",
      kind: "human",
      pageId: "projects",
      cursor: { x: 120, y: 80 },
      selectedIds: [],
    })
    const container = document.createElement("div")
    document.body.append(container)
    renderProjectMap(container, store)

    const viewport = requiredElement(
      container,
      '[aria-label="Project map canvas"]',
    )
    act(() => {
      viewport.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 360,
          clientY: 240,
        }),
      )
    })

    expect(
      store
        .getSnapshot("projects")
        .presence.find((person) => person.viewId === "agent-overview")?.cursor,
    ).toEqual({ x: 20, y: 140 })
    expect(container.querySelectorAll(".spatial-canvas__cursor")).toHaveLength(
      1,
    )
    expect(
      container.querySelector(".spatial-canvas__cursor-label")?.textContent,
    ).toBe("Yav")

    act(() => {
      viewport.dispatchEvent(
        new MouseEvent("pointerout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      )
    })
    expect(
      store
        .getSnapshot("projects")
        .presence.find((person) => person.viewId === "agent-overview")?.cursor,
    ).toBeUndefined()
  })
})
