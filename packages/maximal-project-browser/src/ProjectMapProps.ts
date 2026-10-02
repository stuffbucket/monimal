import type { ProjectMapProject } from "./model.ts"
import type { ProjectMapStore, ProjectMapViewer } from "./store.ts"
import type { Camera } from "./view.ts"

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
  initialCamera?: Camera
  onCameraChange?: (camera: Camera) => void
}
