import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'

import { Dialog } from '@maximal/maximal-electron/renderer'
import {
  ProjectMap,
  createYProjectMapStore,
  type ProjectMapProject,
  type ProjectMapStore,
  type ProjectMapViewer,
} from '@maximal/maximal-project-browser'
import type { ProjectSearchResult } from '@maximal/project-catalog'

import { describeError } from '../shared/errors'
import type { MaximalHost } from '../../shared/host'

function useOwnedMapStoreCleanup(
  ownedMapStore: ProjectMapStore,
  externalMapStore?: ProjectMapStore,
): void {
  const [lifecycleState] = useState({ generation: 0 })
  useEffect(() => {
    const lifecycle = ++lifecycleState.generation
    return () => {
      queueMicrotask(() => {
        if (!externalMapStore && lifecycleState.generation === lifecycle) {
          ownedMapStore.destroy()
        }
      })
    }
  }, [externalMapStore, lifecycleState, ownedMapStore])
}

export function ProjectBrowser({
  open,
  onOpenChange,
  onOpenProject,
  onOpenSettings,
  projectsApi = window.maximal.projects,
  mapStore,
  viewer = {
    id: 'local',
    name: 'You',
    initials: 'YO',
    color: '#0d99ff',
    kind: 'human',
  },
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenProject: (project: ProjectSearchResult) => Promise<void>
  onOpenSettings: () => void
  projectsApi?: MaximalHost['projects']
  mapStore?: ProjectMapStore
  viewer?: ProjectMapViewer
}): ReactElement {
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<ProjectSearchResult[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [ownedMapStore] = useState(createYProjectMapStore)
  const store = mapStore ?? ownedMapStore
  const [pageId, setPageId] = useState('projects')
  const latestSearch = useRef<symbol | undefined>(undefined)

  useOwnedMapStoreCleanup(ownedMapStore, mapStore)

  const search = useCallback(async (value: string): Promise<void> => {
    const request = Symbol()
    latestSearch.current = request
    try {
      const results = await projectsApi.search(value, 75)
      if (latestSearch.current !== request) return
      setProjects(results)
      setError(undefined)
    } catch (cause) {
      if (latestSearch.current === request) setError(describeError(cause))
    }
  }, [projectsApi])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => void search(query), query ? 80 : 0)
    return () => {
      window.clearTimeout(timer)
      latestSearch.current = undefined
    }
  }, [open, query, search])

  useEffect(() => projectsApi.onChange(() => {
    if (!open) return
    void search(query)
  }), [open, projectsApi, query, search])

  const openProject = async (project: ProjectSearchResult): Promise<void> => {
    setBusy(true)
    try {
      await onOpenProject(project)
      await projectsApi.opened(project.id)
      onOpenChange(false)
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }

  const mapProjects = useMemo<ProjectMapProject[]>(() => projects.map((project) => ({
      id: project.id,
      name: project.name,
      path: project.path,
      kind: project.kind,
      available: project.availability === 'available',
      trusted: project.trusted,
      pinned: project.pinned,
    })),
    [projects],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open project"
      description="Search local folders and repositories."
      className="dialog project-browser"
      testId="project-browser"
    >
      <ProjectMap
        projects={mapProjects}
        query={query}
        onQueryChange={setQuery}
        busy={busy}
        error={error}
        store={store}
        pageId={pageId}
        onPageChange={setPageId}
        viewer={viewer}
        onOpenProject={(project) => {
          const result = projects.find((candidate) => candidate.id === project.id)
          if (result) void openProject(result)
        }}
        onOpenSettings={onOpenSettings}
        onAddFolder={() =>
          void projectsApi.addRoot().catch((cause: unknown) =>
            setError(describeError(cause)))}
      />
    </Dialog>
  )
}
