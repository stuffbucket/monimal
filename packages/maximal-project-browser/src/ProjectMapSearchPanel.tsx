import {
  SpatialCanvasPanelHeader,
  SpatialCanvasSearchResult,
  SpatialCanvasSearchResults,
  SpatialCanvasSidePanel,
  TextInput,
} from "@maximal/maximal-electron/renderer"

import type { ProjectMapProject } from "./model.ts"

export function ProjectMapSearchPanel({
  query,
  projects,
  busy,
  onQueryChange,
  onOpenProject,
  onClose,
}: {
  query: string
  projects: Array<ProjectMapProject>
  busy: boolean
  onQueryChange: (value: string) => void
  onOpenProject: (project: ProjectMapProject) => void
  onClose: () => void
}) {
  return (
    <SpatialCanvasSidePanel
      label="Search projects"
      title="Search projects"
      edge
      onClose={onClose}
      header={
        <SpatialCanvasPanelHeader>
          <TextInput
            aria-label="Search projects"
            value={query}
            placeholder="Search projects"
            onChange={onQueryChange}
          />
        </SpatialCanvasPanelHeader>
      }
    >
      <SpatialCanvasSearchResults
        emptyMessage={query ? "No projects match" : "No projects available"}
      >
        {projects.map((project) => (
          <SpatialCanvasSearchResult
            key={project.id}
            title={project.name}
            description={project.path}
            disabled={busy || !project.available || !project.trusted}
            onSelect={() => onOpenProject(project)}
          />
        ))}
      </SpatialCanvasSearchResults>
    </SpatialCanvasSidePanel>
  )
}
