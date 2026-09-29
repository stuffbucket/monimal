import fuzzysort from 'fuzzysort'

export type ProjectKind = 'folder' | 'repository' | 'worktree' | 'bare'
export type ProjectAvailability = 'available' | 'missing' | 'denied' | 'unsafe' | 'invalid'
export type ScanState = 'never' | 'complete' | 'partial' | 'denied' | 'missing'

export interface DiscoveryRoot {
  id: string
  path: string
  enabled: boolean
  trusted: boolean
  trustSubtrees: boolean
  maxDepth: number
  maxEntries: number
  maxDurationMs: number
  includeHidden: boolean
  exclusions: string[]
  lastScanState: ScanState
  lastScanAt?: string
  issueCount: number
}

export interface ProjectRecord {
  id: string
  name: string
  path: string
  kind: ProjectKind
  availability: ProjectAvailability
  repositoryPath?: string
  gitCommonDirectory?: string
  remotes: string[]
  markers: string[]
  lastSeenAt: string
  lastOpenedAt?: string
  visitCount: number
  pinned: boolean
  trusted: boolean
}

export interface UpdateDiscoveryRoot {
  enabled?: boolean
  trusted?: boolean
  trustSubtrees?: boolean
  maxDepth?: number
  includeHidden?: boolean
  exclusions?: string[]
}

export interface ProjectSearchResult extends ProjectRecord {
  score: number
}

export interface ProjectCatalogSnapshot {
  roots: DiscoveryRoot[]
  projects: ProjectRecord[]
  refreshing: boolean
}

export interface ProjectScanIssue {
  path: string
  operation: 'read' | 'stat' | 'git'
  code: string
  message: string
}

export interface DiscoveredProject {
  path: string
  canonicalPath: string
  name: string
  kind: ProjectKind
  availability: ProjectAvailability
  repositoryPath?: string
  gitCommonDirectory?: string
  remotes: string[]
  markers: string[]
}

export interface RootScanResult {
  projects: DiscoveredProject[]
  issues: ProjectScanIssue[]
  state: Exclude<ScanState, 'never'>
  visitedEntries: number
}

export interface ScanRootOptions {
  maxDepth: number
  maxEntries: number
  maxDurationMs: number
  includeHidden: boolean
  exclusions: string[]
  signal?: AbortSignal
}

function searchableText(project: ProjectRecord): string {
  return [
    project.name,
    project.path,
    project.repositoryPath,
    ...project.remotes,
    ...project.markers,
  ].filter(Boolean).join(' ')
}

export function rankProjects(
  projects: readonly ProjectRecord[],
  query: string,
  limit = 50,
): ProjectSearchResult[] {
  const normalized = query.trim()
  if (normalized === '') {
    return [...projects]
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned)
        || (right.lastOpenedAt ?? '').localeCompare(left.lastOpenedAt ?? '')
        || right.visitCount - left.visitCount
        || left.name.localeCompare(right.name))
      .slice(0, limit)
      .map((project) => ({ ...project, score: 0 }))
  }

  return fuzzysort.go(normalized, projects, {
    key: searchableText,
    limit,
    threshold: 0.15,
  }).map(({ obj, score }) => ({
    ...obj,
    score: score + (obj.pinned ? 0.1 : 0),
  }))
}
