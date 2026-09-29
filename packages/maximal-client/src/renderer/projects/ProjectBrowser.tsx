import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import {
  Button,
  Dialog,
  Note,
  TextInput,
} from '@maximal/maximal-electron/renderer'
import type { ProjectSearchResult } from '@maximal/project-catalog'

import { describeError } from '../shared/errors'
import type { MaximalHost } from '../../shared/host'

export function ProjectBrowser({
  open,
  onOpenChange,
  onOpenProject,
  onOpenSettings,
  projectsApi = window.maximal.projects,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenProject: (project: ProjectSearchResult) => Promise<void>
  onOpenSettings: () => void
  projectsApi?: MaximalHost['projects']
}): ReactElement {
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<ProjectSearchResult[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const latestSearch = useRef<symbol | undefined>(undefined)

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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open project"
      description="Search local folders and repositories."
      className="dialog project-browser"
      testId="project-browser"
    >
      <TextInput
        aria-label="Search projects"
        value={query}
        placeholder="Search by name, path, or remote"
        onChange={setQuery}
      />
      <div className="project-browser__results" role="listbox" aria-label="Projects">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            role="option"
            aria-selected="false"
            className="project-browser__result"
            disabled={busy || !project.trusted || project.availability !== 'available'}
            onClick={() => void openProject(project)}
          >
            <span className="project-browser__name">{project.name}</span>
            <span className="project-browser__path">{project.path}</span>
            <span className="project-browser__meta">
              {project.kind}
              {!project.trusted ? ' · Restricted mode' : ''}
              {project.availability !== 'available' ? ` · ${project.availability}` : ''}
            </span>
          </button>
        ))}
        {projects.length === 0 && !error ? (
          <Note>No projects found. Add a discovery folder in Projects settings.</Note>
        ) : null}
      </div>
      {error ? <Note status="failed" live="assertive">{error}</Note> : null}
      <div className="project-browser__actions">
        <Button onClick={onOpenSettings}>Projects settings</Button>
        <Button variant="primary" onClick={() =>
          void projectsApi.addRoot().catch((cause: unknown) =>
            setError(describeError(cause)))}>
          Add folder
        </Button>
      </div>
    </Dialog>
  )
}
