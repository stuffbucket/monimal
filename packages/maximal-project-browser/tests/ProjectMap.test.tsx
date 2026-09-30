import { TooltipProvider } from "@maximal/maximal-electron/renderer"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectMap } from "../src/ProjectMap.tsx"
import { createYProjectMapStore } from "../src/store.ts"

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

describe("ProjectMap", () => {
  it("renders independent pages, board tools, presence, comments, and chat", () => {
    const store = createYProjectMapStore()
    const container = document.createElement("div")
    document.body.append(container)
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

    expect(container.querySelectorAll(".spatial-canvas__project")).toHaveLength(
      1,
    )
    expect(
      container.querySelector('[title="Map agent · agent"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Map pages"]')?.textContent,
    ).toContain("Projects")

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

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Chat"]')?.click()
    })
    expect(container.querySelector('[aria-label="Team chat"]')).not.toBeNull()

    act(() => root?.unmount())
    root = undefined
    store.destroy()
  })
})
