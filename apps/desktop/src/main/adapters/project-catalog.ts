import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  rankProjects,
  type DiscoveryRoot,
  type DiscoveredProject,
  type ProjectCatalogSnapshot,
  type ProjectRecord,
  type ProjectSearchResult,
  type UpdateDiscoveryRoot,
} from '@maximal/project-catalog'
import { scanRoot } from '@maximal/project-catalog/node'

import { mainLogger } from '../main-logger.js'

interface RootRow {
  id: string
  path: string
  enabled: number
  trusted: number
  trust_subtrees: number
  max_depth: number
  max_entries: number
  max_duration_ms: number
  include_hidden: number
  exclusions: string
  last_scan_state: DiscoveryRoot['lastScanState']
  last_scan_at: string | null
  issue_count: number
}

interface ProjectRow {
  id: string
  name: string
  path: string
  kind: ProjectRecord['kind']
  availability: ProjectRecord['availability']
  repository_path: string | null
  git_common_directory: string | null
  remotes: string
  markers: string
  last_seen_at: string
  last_opened_at: string | null
  visit_count: number
  pinned: number
  trusted: number
}

const ROOT_DEFAULTS = {
  maxDepth: 4,
  maxEntries: 25_000,
  maxDurationMs: 10_000,
  includeHidden: false,
  exclusions: [] as string[],
}

function rootFromRow(row: RootRow): DiscoveryRoot {
  return {
    id: row.id,
    path: row.path,
    enabled: row.enabled === 1,
    trusted: row.trusted === 1,
    trustSubtrees: row.trust_subtrees === 1,
    maxDepth: row.max_depth,
    maxEntries: row.max_entries,
    maxDurationMs: row.max_duration_ms,
    includeHidden: row.include_hidden === 1,
    exclusions: JSON.parse(row.exclusions) as string[],
    lastScanState: row.last_scan_state,
    ...(row.last_scan_at ? { lastScanAt: row.last_scan_at } : {}),
    issueCount: row.issue_count,
  }
}

function projectFromRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    kind: row.kind,
    availability: row.availability,
    ...(row.repository_path ? { repositoryPath: row.repository_path } : {}),
    ...(row.git_common_directory ? { gitCommonDirectory: row.git_common_directory } : {}),
    remotes: JSON.parse(row.remotes) as string[],
    markers: JSON.parse(row.markers) as string[],
    lastSeenAt: row.last_seen_at,
    ...(row.last_opened_at ? { lastOpenedAt: row.last_opened_at } : {}),
    visitCount: row.visit_count,
    pinned: row.pinned === 1,
    trusted: row.trusted === 1,
  }
}

export class DesktopProjectCatalog {
  readonly #database: DatabaseSync
  readonly #scan: typeof scanRoot
  #refreshing = false

  private constructor(database: DatabaseSync, scan: typeof scanRoot) {
    this.#database = database
    this.#scan = scan
    this.#migrate()
  }

  static async open(
    userDataPath: string,
    scan: typeof scanRoot = scanRoot,
  ): Promise<DesktopProjectCatalog> {
    const directory = join(userDataPath, 'projects')
    await mkdir(directory, { recursive: true })
    return new DesktopProjectCatalog(
      new DatabaseSync(join(directory, 'catalog.sqlite')),
      scan,
    )
  }

  #migrate(): void {
    this.#database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS discovery_roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL,
        trusted INTEGER NOT NULL,
        trust_subtrees INTEGER NOT NULL,
        max_depth INTEGER NOT NULL,
        max_entries INTEGER NOT NULL,
        max_duration_ms INTEGER NOT NULL,
        include_hidden INTEGER NOT NULL,
        exclusions TEXT NOT NULL,
        last_scan_state TEXT NOT NULL,
        last_scan_at TEXT,
        issue_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        canonical_path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        availability TEXT NOT NULL,
        repository_path TEXT,
        git_common_directory TEXT,
        remotes TEXT NOT NULL,
        markers TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_opened_at TEXT,
        visit_count INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS project_sources (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        root_id TEXT NOT NULL REFERENCES discovery_roots(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, root_id)
      );
      CREATE TABLE IF NOT EXISTS scan_issues (
        root_id TEXT NOT NULL REFERENCES discovery_roots(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        operation TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL
      );
    `)
  }

  roots(): DiscoveryRoot[] {
    return (this.#database.prepare(
      'SELECT * FROM discovery_roots ORDER BY path COLLATE NOCASE',
    ).all() as unknown as RootRow[]).map(rootFromRow)
  }

  projects(): ProjectRecord[] {
    return (this.#database.prepare(`
      SELECT p.*,
        MAX(CASE
          WHEN r.trusted = 1 AND (r.trust_subtrees = 1 OR p.path = r.path) THEN 1
          ELSE 0
        END) AS trusted
      FROM projects p
      JOIN project_sources ps ON ps.project_id = p.id
      JOIN discovery_roots r ON r.id = ps.root_id
      GROUP BY p.id
      ORDER BY p.name COLLATE NOCASE
    `).all() as unknown as ProjectRow[]).map(projectFromRow)
  }

  snapshot(): ProjectCatalogSnapshot {
    return {
      roots: this.roots(),
      projects: this.projects(),
      refreshing: this.#refreshing,
    }
  }

  search(query: string, limit?: number): ProjectSearchResult[] {
    return rankProjects(this.projects(), query, limit)
  }

  isTrustedPath(path: string): boolean {
    return this.projects().some((project) =>
      project.path === path
      && project.trusted
      && project.availability === 'available')
  }

  addRoot(path: string): DiscoveryRoot {
    const existing = this.#database.prepare(
      'SELECT * FROM discovery_roots WHERE path = ?',
    ).get(path) as unknown as RootRow | undefined
    if (existing) return rootFromRow(existing)
    const root: DiscoveryRoot = {
      id: randomUUID(),
      path,
      enabled: true,
      trusted: false,
      trustSubtrees: false,
      ...ROOT_DEFAULTS,
      lastScanState: 'never',
      issueCount: 0,
    }
    this.#database.prepare(`
      INSERT INTO discovery_roots (
        id, path, enabled, trusted, trust_subtrees, max_depth, max_entries,
        max_duration_ms, include_hidden, exclusions, last_scan_state, issue_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      root.id,
      root.path,
      1,
      0,
      0,
      root.maxDepth,
      root.maxEntries,
      root.maxDurationMs,
      0,
      JSON.stringify(root.exclusions),
      root.lastScanState,
      0,
    )
    return root
  }

  updateRoot(id: string, update: UpdateDiscoveryRoot): DiscoveryRoot {
    const current = this.roots().find((root) => root.id === id)
    if (!current) throw new Error('Project discovery root was not found.')
    const next = { ...current, ...update }
    this.#database.prepare(`
      UPDATE discovery_roots SET
        enabled = ?, trusted = ?, trust_subtrees = ?, max_depth = ?,
        include_hidden = ?, exclusions = ?
      WHERE id = ?
    `).run(
      Number(next.enabled),
      Number(next.trusted),
      Number(next.trustSubtrees),
      next.maxDepth,
      Number(next.includeHidden),
      JSON.stringify(next.exclusions),
      id,
    )
    return next
  }

  removeRoot(id: string): void {
    this.#database.exec('BEGIN')
    try {
      this.#database.prepare('DELETE FROM discovery_roots WHERE id = ?').run(id)
      this.#database.exec(`
        DELETE FROM projects
        WHERE NOT EXISTS (
          SELECT 1 FROM project_sources WHERE project_sources.project_id = projects.id
        )
      `)
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  async refresh(rootId?: string): Promise<ProjectCatalogSnapshot> {
    if (this.#refreshing) return this.snapshot()
    this.#refreshing = true
    try {
      const roots = this.roots().filter((root) =>
        root.enabled && (rootId === undefined || root.id === rootId))
      for (const root of roots) await this.#refreshRoot(root)
      return this.snapshot()
    } finally {
      this.#refreshing = false
    }
  }

  async #refreshRoot(root: DiscoveryRoot): Promise<void> {
    const result = await this.#scan(root.path, root)
    const scannedAt = new Date().toISOString()
    this.#database.exec('BEGIN')
    try {
      const seenIds = result.projects.map((project) =>
        this.#upsertProject(root.id, project, scannedAt))
      this.#database.prepare('DELETE FROM scan_issues WHERE root_id = ?').run(root.id)
      const insertIssue = this.#database.prepare(`
        INSERT INTO scan_issues (root_id, path, operation, code, message)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const entry of result.issues) {
        insertIssue.run(root.id, entry.path, entry.operation, entry.code, entry.message)
      }
      this.#database.prepare(`
        UPDATE discovery_roots
        SET last_scan_state = ?, last_scan_at = ?, issue_count = ?
        WHERE id = ?
      `).run(result.state, scannedAt, result.issues.length, root.id)
      if (result.state === 'complete') {
        const known = this.#database.prepare(
          'SELECT project_id FROM project_sources WHERE root_id = ?',
        ).all(root.id) as unknown as Array<{ project_id: string }>
        const seen = new Set(seenIds)
        const removeSource = this.#database.prepare(
          'DELETE FROM project_sources WHERE root_id = ? AND project_id = ?',
        )
        for (const { project_id: projectId } of known) {
          if (!seen.has(projectId)) removeSource.run(root.id, projectId)
        }
      }
      this.#database.exec(`
        DELETE FROM projects
        WHERE NOT EXISTS (
          SELECT 1 FROM project_sources WHERE project_sources.project_id = projects.id
        )
      `)
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  #upsertProject(rootId: string, project: DiscoveredProject, scannedAt: string): string {
    const existing = this.#database.prepare(
      'SELECT id FROM projects WHERE canonical_path = ?',
    ).get(project.canonicalPath) as unknown as { id: string } | undefined
    const id = existing?.id ?? randomUUID()
    this.#database.prepare(`
      INSERT INTO projects (
        id, canonical_path, name, path, kind, availability, repository_path,
        git_common_directory, remotes, markers, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_path) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        kind = excluded.kind,
        availability = excluded.availability,
        repository_path = excluded.repository_path,
        git_common_directory = excluded.git_common_directory,
        remotes = excluded.remotes,
        markers = excluded.markers,
        last_seen_at = excluded.last_seen_at
    `).run(
      id,
      project.canonicalPath,
      project.name,
      project.path,
      project.kind,
      project.availability,
      project.repositoryPath ?? null,
      project.gitCommonDirectory ?? null,
      JSON.stringify(project.remotes),
      JSON.stringify(project.markers),
      scannedAt,
    )
    this.#database.prepare(`
      INSERT OR IGNORE INTO project_sources (project_id, root_id) VALUES (?, ?)
    `).run(id, rootId)
    return id
  }

  opened(projectId: string): void {
    const result = this.#database.prepare(`
      UPDATE projects
      SET visit_count = visit_count + 1, last_opened_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), projectId)
    if (result.changes === 0) throw new Error('Project was not found.')
  }

  close(): void {
    try {
      this.#database.close()
    } catch (error) {
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Project catalog database close failed',
      )
    }
  }
}
