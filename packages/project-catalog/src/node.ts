import { execFile } from 'node:child_process'
import { opendir, realpath } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import type {
  DiscoveredProject,
  ProjectKind,
  ProjectScanIssue,
  RootScanResult,
  ScanRootOptions,
} from './index.js'

const execFileAsync = promisify(execFile)
const BUILT_IN_EXCLUSIONS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'target',
  '.next',
])
const PROJECT_MARKERS = new Set([
  '.code-workspace',
  '.vscode',
  '.devcontainer',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Makefile',
  'CMakeLists.txt',
  'justfile',
])

interface QueueEntry {
  path: string
  depth: number
  explicit: boolean
}

interface DirectoryFacts {
  names: Set<string>
  children: string[]
  entryCount: number
  truncated: boolean
}

function issue(path: string, operation: ProjectScanIssue['operation'], error: unknown): ProjectScanIssue {
  const value = error as NodeJS.ErrnoException
  return {
    path,
    operation,
    code: value.code ?? 'UNKNOWN',
    message: value.message ?? String(error),
  }
}

async function readDirectory(
  path: string,
  options: ScanRootOptions,
  remainingEntries: number,
): Promise<DirectoryFacts> {
  const directory = await opendir(path)
  const names = new Set<string>()
  const children: string[] = []
  let entryCount = 0
  let truncated = false
  for await (const entry of directory) {
    if (entryCount >= remainingEntries) {
      truncated = true
      break
    }
    entryCount += 1
    names.add(entry.name)
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    if (BUILT_IN_EXCLUSIONS.has(entry.name) || options.exclusions.includes(entry.name)) continue
    if (!options.includeHidden && entry.name.startsWith('.')) continue
    children.push(join(path, entry.name))
  }
  return { names, children, entryCount, truncated }
}

async function gitOutput(
  path: string,
  args: string[],
  bareCandidate: boolean,
): Promise<string> {
  const context = bareCandidate ? ['--git-dir', path] : ['-C', path]
  const { stdout } = await execFileAsync('git', [...context, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  })
  return stdout.trim()
}

async function inspectGit(
  path: string,
  bareCandidate: boolean,
): Promise<Partial<DiscoveredProject>> {
  let topLevel: string | undefined
  if (!bareCandidate) {
    topLevel = await gitOutput(path, ['rev-parse', '--show-toplevel'], false)
  }
  const [absoluteGitDirectory, commonDirectory, bareValue, remoteNames] =
    await Promise.all([
      gitOutput(path, ['rev-parse', '--absolute-git-dir'], bareCandidate),
      gitOutput(path, ['rev-parse', '--git-common-dir'], bareCandidate),
      gitOutput(path, ['rev-parse', '--is-bare-repository'], bareCandidate),
      gitOutput(path, ['remote'], bareCandidate),
    ])
  const remotes = (
    await Promise.all(remoteNames.split('\n').filter(Boolean).map(async (name) =>
      (await gitOutput(
        path,
        ['remote', 'get-url', '--all', name],
        bareCandidate,
      ).catch(() => ''))
        .split('\n').filter(Boolean)))
  ).flat()
  const bare = bareValue === 'true'
  const repositoryPath = bare ? await realpath(path) : topLevel || await realpath(path)
  const resolvedCommon = await realpath(resolve(path, commonDirectory))
  const resolvedGitDirectory = await realpath(absoluteGitDirectory)
  const kind: ProjectKind = bare
    ? 'bare'
    : resolvedCommon !== resolvedGitDirectory
      ? 'worktree'
      : 'repository'
  return {
    kind,
    repositoryPath,
    gitCommonDirectory: resolvedCommon,
    remotes,
  }
}

export async function scanRoot(path: string, options: ScanRootOptions): Promise<RootScanResult> {
  const queue: QueueEntry[] = [{ path: resolve(path), depth: 0, explicit: true }]
  const projects: DiscoveredProject[] = []
  const issues: ProjectScanIssue[] = []
  const startedAt = Date.now()
  let visitedEntries = 0
  let limited = false

  for (
    let current = queue.shift();
    current !== undefined;
    current = queue.shift()
  ) {
    if (options.signal?.aborted) {
      limited = true
      break
    }
    if (visitedEntries >= options.maxEntries || Date.now() - startedAt >= options.maxDurationMs) {
      limited = true
      break
    }
    visitedEntries += 1

    let canonicalPath: string
    let facts: DirectoryFacts
    try {
      canonicalPath = await realpath(current.path)
      facts = await readDirectory(
        current.path,
        options,
        options.maxEntries - visitedEntries,
      )
    } catch (error) {
      issues.push(issue(current.path, 'read', error))
      continue
    }

    visitedEntries += facts.entryCount
    if (facts.truncated) limited = true
    const markers = [...facts.names].filter((name) => PROJECT_MARKERS.has(name))
    const bareCandidate =
        facts.names.has('HEAD')
        && facts.names.has('objects')
        && facts.names.has('refs')
    const gitCandidate = facts.names.has('.git') || bareCandidate
    if (current.explicit || gitCandidate || markers.length > 0) {
      let git: Partial<DiscoveredProject> = {}
      if (gitCandidate) {
        try {
          git = await inspectGit(current.path, bareCandidate)
        } catch (error) {
          issues.push(issue(current.path, 'git', error))
          const message = error instanceof Error ? error.message : String(error)
          git = { availability: message.includes('dubious ownership') ? 'unsafe' : 'invalid' }
        }
      }
      projects.push({
        path: current.path,
        canonicalPath,
        name: basename(current.path),
        kind: git.kind ?? 'folder',
        availability: git.availability ?? 'available',
        ...(git.repositoryPath ? { repositoryPath: git.repositoryPath } : {}),
        ...(git.gitCommonDirectory ? { gitCommonDirectory: git.gitCommonDirectory } : {}),
        remotes: git.remotes ?? [],
        markers,
      })
    }
    if (limited || gitCandidate || current.depth >= options.maxDepth) continue
    queue.push(...facts.children.map((child) => ({
      path: child,
      depth: current.depth + 1,
      explicit: false,
    })))
  }

  const rootIssue = issues.find((entry) => entry.path === resolve(path))
  const state = rootIssue?.code === 'ENOENT'
    ? 'missing'
    : rootIssue?.code === 'EACCES' || rootIssue?.code === 'EPERM'
      ? 'denied'
      : limited || issues.length > 0
        ? 'partial'
        : 'complete'
  return { projects, issues, state, visitedEntries }
}
