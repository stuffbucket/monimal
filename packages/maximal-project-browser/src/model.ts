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
  authorId?: string
  authorInitials?: string
  authorColor?: string
  body: string
  createdAt?: string
  x: number
  y: number
  anchor?: {
    itemId: string
    offsetX: number
    offsetY: number
  }
  replies?: Array<ProjectMapCommentReply>
  resolved: boolean
}

interface ProjectMapCommentReply {
  id: string
  author: string
  authorId?: string
  authorInitials?: string
  authorColor?: string
  body: string
  createdAt: string
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
      x: column * 232 + (seed % 9),
      y: row * 88 + ((seed >>> 8) % 7),
      width: 208,
      height: 64,
      project,
    }
  })
}
