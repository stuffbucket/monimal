export type ProjectMapTool =
  "select" | "hand" | "sticky" | "shape" | "section" | "connector" | "comment"

export interface ProjectMapProject {
  id: string
  name: string
  path: string
  kind: string
  available: boolean
  trusted: boolean
  pinned?: boolean
}

export interface ProjectMapComment {
  id: string
  author: string
  body: string
  x: number
  y: number
  resolved: boolean
}

export interface ProjectMapMessage {
  id: string
  author: string
  body: string
}

export type SceneItem =
  | {
      id: string
      type: "project"
      x: number
      y: number
      width: number
      height: number
      project: ProjectMapProject
    }
  | {
      id: string
      type: "sticky" | "shape" | "section"
      x: number
      y: number
      width: number
      height: number
      text: string
    }
  | {
      id: string
      type: "connector"
      fromId: string
      toId: string
    }

function hash(value: string): number {
  let result = 2166136261
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function layoutProjects(
  projects: Array<ProjectMapProject>,
): Array<SceneItem> {
  return projects.map((project, index) => {
    const seed = hash(project.id)
    const column = index % 2
    const row = Math.floor(index / 2)
    return {
      id: `project:${project.id}`,
      type: "project",
      x: column * 276 + (seed % 13),
      y: row * 120 + ((seed >>> 8) % 11),
      width: 248,
      height: 88,
      project,
    }
  })
}
