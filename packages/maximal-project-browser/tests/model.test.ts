import { describe, expect, it } from "vitest"

import { layoutProjects } from "../src/model.ts"

describe("layoutProjects", () => {
  it("creates stable, non-overlapping project cards", () => {
    const projects = Array.from({ length: 8 }, (_, index) => ({
      id: `project-${index}`,
      name: `Project ${index}`,
      path: `/work/project-${index}`,
      kind: "repository",
      available: true,
      trusted: true,
    }))

    expect(layoutProjects(projects)).toEqual(layoutProjects(projects))
    expect(
      new Set(
        layoutProjects(projects).map((item) =>
          "x" in item ? `${item.x}:${item.y}` : item.id,
        ),
      ).size,
    ).toBe(8)
  })
})
