import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface GitResult {
  stdout: string
  stderr: string
}

type GitCall = [string, string[], {
  env: NodeJS.ProcessEnv
  timeout: number
  maxBuffer: number
}]

const failures = vi.hoisted<{
  opendirPath: string
  opendirError: Error | undefined
}>(() => ({
  opendirPath: '',
  opendirError: undefined,
}))
const git = vi.hoisted(() => ({
  handler: undefined as undefined | ((args: GitCall) => Promise<GitResult>),
}))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>(
    'node:fs/promises',
  )
  return {
    ...actual,
    opendir: (...args: Parameters<typeof actual.opendir>) =>
      String(args[0]) === failures.opendirPath
        ? Promise.reject(failures.opendirError ?? new Error('missing test error'))
        : actual.opendir(...args),
  }
})

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>(
    'node:child_process',
  )
  const utilities = await vi.importActual<typeof import('node:util')>('node:util')
  const actualAsync = utilities.promisify(actual.execFile)
  const mockedExecFile = (...args: unknown[]) =>
    Reflect.apply(actual.execFile, undefined, args) as ReturnType<typeof actual.execFile>
  Object.defineProperty(mockedExecFile, utilities.promisify.custom, {
    value: (...args: unknown[]): Promise<GitResult> =>
      git.handler
        ? git.handler(args as GitCall)
        : Reflect.apply(actualAsync, undefined, args) as Promise<GitResult>,
  })
  return { ...actual, execFile: mockedExecFile }
})

import { rankProjects, type ProjectRecord } from '../src/index.js'
import { scanRoot } from '../src/node.js'

const options = {
  maxDepth: 4,
  maxEntries: 1_000,
  maxDurationMs: 5_000,
  includeHidden: false,
  exclusions: [],
}
const execFileAsync = promisify(execFile)

describe('project catalog', () => {
  afterEach(() => {
    failures.opendirPath = ''
    failures.opendirError = undefined
    git.handler = undefined
  })

  it('discovers the explicit folder and marked children without descending into repositories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    await mkdir(join(root, 'app', '.git'), { recursive: true })
    await writeFile(join(root, 'app', 'package.json'), '{}')
    await mkdir(join(root, 'app', 'nested'), { recursive: true })
    await writeFile(join(root, 'app', 'nested', 'package.json'), '{}')
    await mkdir(join(root, 'notes'), { recursive: true })

    const result = await scanRoot(root, { ...options, includeHidden: true })
    expect(result.projects.map(({ path }) => path)).toEqual([root, join(root, 'app')])
    expect(result.visitedEntries).toBeGreaterThan(0)
  })

  it('recognizes every project marker and ignores every built-in excluded subtree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    const markers = [
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
    ]
    const exclusions = [
      'node_modules',
      'vendor',
      'dist',
      'build',
      'target',
      '.next',
    ]
    for (const [index, marker] of markers.entries()) {
      const project = join(root, `marker-${index}`)
      await mkdir(project)
      if (marker.startsWith('.')) await mkdir(join(project, marker))
      else await writeFile(join(project, marker), '')
    }
    for (const exclusion of exclusions) {
      const project = join(root, exclusion, 'hidden-project')
      await mkdir(project, { recursive: true })
      await writeFile(join(project, 'package.json'), '{}')
    }

    const result = await scanRoot(root, { ...options, includeHidden: true })

    expect(
      result.projects.slice(1).flatMap(({ markers: found }) => found).sort(),
    ).toEqual([...markers].sort())
    expect(result.projects).toHaveLength(markers.length + 1)
  })

  it('does not follow directory symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    const outside = await mkdtemp(join(tmpdir(), 'project-catalog-outside-'))
    await writeFile(join(outside, 'package.json'), '{}')
    await symlink(outside, join(root, 'linked-project'))

    const result = await scanRoot(root, options)

    expect(result.projects.map(({ path }) => path)).toEqual([root])
    expect(result.visitedEntries).toBe(2)
  })

  it('applies hidden, exclusion, depth, entry, and cancellation limits independently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    await mkdir(join(root, '.hidden'), { recursive: true })
    await writeFile(join(root, '.hidden', 'package.json'), '{}')
    await mkdir(join(root, 'excluded'), { recursive: true })
    await writeFile(join(root, 'excluded', 'package.json'), '{}')
    await mkdir(join(root, 'deep', 'child'), { recursive: true })
    await writeFile(join(root, 'deep', 'child', 'package.json'), '{}')

    const defaultResult = await scanRoot(root, {
      ...options,
      exclusions: ['excluded'],
      maxDepth: 1,
    })
    expect(defaultResult.projects.map(({ path }) => path)).toEqual([root])

    const hiddenResult = await scanRoot(root, {
      ...options,
      includeHidden: true,
      exclusions: ['excluded'],
      maxDepth: 1,
    })
    expect(hiddenResult.projects.map(({ path }) => path)).toEqual([
      root,
      join(root, '.hidden'),
    ])

    const limited = await scanRoot(root, { ...options, maxEntries: 1 })
    expect(limited.state).toBe('partial')
    expect(limited.visitedEntries).toBe(1)

    const controller = new AbortController()
    controller.abort()
    const cancelled = await scanRoot(root, { ...options, signal: controller.signal })
    expect(cancelled).toEqual({
      projects: [],
      issues: [],
      state: 'partial',
      visitedEntries: 0,
    })

    const expired = await scanRoot(root, { ...options, maxDurationMs: 0 })
    expect(expired).toEqual({
      projects: [],
      issues: [],
      state: 'partial',
      visitedEntries: 0,
    })
  })

  it('counts the root and directory entries exactly and reports truncation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    await writeFile(join(root, 'one'), '')
    await writeFile(join(root, 'two'), '')

    const complete = await scanRoot(root, { ...options, maxEntries: 3 })
    expect(complete.state).toBe('complete')
    expect(complete.visitedEntries).toBe(3)

    const truncated = await scanRoot(root, { ...options, maxEntries: 2 })
    expect(truncated.state).toBe('partial')
    expect(truncated.visitedEntries).toBe(2)

    const queuedRoot = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    await mkdir(join(queuedRoot, 'child'))
    const stoppedAtBoundary = await scanRoot(queuedRoot, {
      ...options,
      maxEntries: 2,
    })
    expect(stoppedAtBoundary.state).toBe('partial')
    expect(stoppedAtBoundary.visitedEntries).toBe(2)
    expect(stoppedAtBoundary.projects.map(({ path }) => path)).toEqual([queuedRoot])
  })

  it('reports a missing root instead of returning a successful empty scan', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'project-catalog-')), 'missing')

    const result = await scanRoot(root, options)

    expect(result.state).toBe('missing')
    expect(result.projects).toEqual([])
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: root,
        operation: 'read',
        code: 'ENOENT',
      }),
    ])
  })

  it('normalizes unexpected read failures and distinguishes denied roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    failures.opendirPath = root
    failures.opendirError = new Error('plain failure')

    const unexpected = await scanRoot(root, options)
    expect(unexpected).toEqual({
      projects: [],
      issues: [{
        path: root,
        operation: 'read',
        code: 'UNKNOWN',
        message: 'plain failure',
      }],
      state: 'partial',
      visitedEntries: 1,
    })

    for (const code of ['EACCES', 'EPERM']) {
      const deniedError = Object.assign(new Error(), { code })
      Object.defineProperty(deniedError, 'message', { value: undefined })
      failures.opendirError = deniedError
      const denied = await scanRoot(root, options)
      expect(denied.state).toBe('denied')
      expect(denied.issues[0]).toEqual({
        path: root,
        operation: 'read',
        code,
        message: 'Error',
      })
    }
  })

  it('keeps a child read failure partial rather than treating it as a root failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    const child = join(root, 'child')
    await mkdir(child)
    failures.opendirPath = child
    failures.opendirError = Object.assign(new Error('denied child'), {
      code: 'EACCES',
    })

    const result = await scanRoot(root, options)

    expect(result.state).toBe('partial')
    expect(result.projects.map(({ path }) => path)).toEqual([root])
    expect(result.issues).toEqual([{
      path: child,
      operation: 'read',
      code: 'EACCES',
      message: 'denied child',
    }])
  })

  it('requires every bare repository marker', async () => {
    for (const present of [
      ['HEAD', 'objects'],
      ['HEAD', 'refs'],
      ['objects', 'refs'],
    ]) {
      const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
      for (const name of present) await writeFile(join(root, name), '')
      const calls: GitCall[] = []
      git.handler = (args) => {
        calls.push(args)
        return Promise.resolve({ stdout: '', stderr: '' })
      }

      const result = await scanRoot(root, options)

      expect(calls).toEqual([])
      expect(result.projects[0]).toEqual(expect.objectContaining({
        kind: 'folder',
        availability: 'available',
      }))
      git.handler = undefined
    }
  })

  it('passes bounded, lock-free commands to Git and filters failed remote lookups', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    await mkdir(join(root, '.git'))
    const calls: GitCall[] = []
    git.handler = (call) => {
      calls.push(call)
      const args = call[1]
      const operation = args.slice(2).join(' ')
      if (operation === 'rev-parse --show-toplevel') {
        return Promise.resolve({ stdout: `${root}\n`, stderr: '' })
      }
      if (operation === 'rev-parse --absolute-git-dir') {
        return Promise.resolve({ stdout: `${join(root, '.git')}\n`, stderr: '' })
      }
      if (operation === 'rev-parse --git-common-dir') {
        return Promise.resolve({ stdout: '.git\n', stderr: '' })
      }
      if (operation === 'rev-parse --is-bare-repository') {
        return Promise.resolve({ stdout: 'false\n', stderr: '' })
      }
      if (operation === 'remote') {
        return Promise.resolve({ stdout: 'origin\n\nbroken\n', stderr: '' })
      }
      if (operation === 'remote get-url --all origin') {
        return Promise.resolve({ stdout: 'one\n\ntwo\n', stderr: '' })
      }
      return Promise.reject(new Error('missing remote'))
    }

    const result = await scanRoot(root, options)

    expect(result.issues).toEqual([])
    expect(result.projects[0]).toEqual({
      path: root,
      canonicalPath: await realpath(root),
      name: root.split('/').at(-1),
      kind: 'repository',
      availability: 'available',
      repositoryPath: root,
      gitCommonDirectory: await realpath(join(root, '.git')),
      remotes: ['one', 'two'],
      markers: [],
    })

    expect(calls).toHaveLength(7)
    for (const [command, args, commandOptions] of calls) {
      expect(command).toBe('git')
      expect(args.slice(0, 2)).toEqual(['-C', root])
      expect(commandOptions.env.GIT_OPTIONAL_LOCKS).toBe('0')
      expect(commandOptions.timeout).toBe(5_000)
      expect(commandOptions.maxBuffer).toBe(1024 * 1024)
    }
  })

  it('distinguishes a linked worktree from its common repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    const common = join(root, '.git')
    const worktreeGit = join(common, 'worktrees', 'linked')
    await mkdir(worktreeGit, { recursive: true })
    git.handler = (call) => {
      const args = call[1]
      const operation = args.slice(2).join(' ')
      const outputs: Record<string, string> = {
        'rev-parse --show-toplevel': root,
        'rev-parse --absolute-git-dir': worktreeGit,
        'rev-parse --git-common-dir': common,
        'rev-parse --is-bare-repository': 'false',
        remote: '',
      }
      return Promise.resolve({ stdout: outputs[operation] ?? '', stderr: '' })
    }

    const result = await scanRoot(root, options)

    expect(result.projects[0]).toEqual(expect.objectContaining({
      kind: 'worktree',
      gitCommonDirectory: await realpath(common),
    }))
  })

  it('reports unsafe and invalid Git candidates without discarding them', async () => {
    for (const [error, availability, message] of [
      [new Error('detected dubious ownership'), 'unsafe', 'detected dubious ownership'],
      ['not an error object', 'invalid', 'not an error object'],
    ] as const) {
      const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
      await mkdir(join(root, '.git'))
      git.handler = () =>
        // Runtime integrations can reject with values that are not Error instances.
        Promise.reject(error) // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors

      const result = await scanRoot(root, options)

      expect(result.state).toBe('partial')
      expect(result.issues).toEqual([{
        path: root,
        operation: 'git',
        code: 'UNKNOWN',
        message,
      }])
      expect(result.projects[0]).toEqual(expect.objectContaining({
        kind: 'folder',
        availability,
        remotes: [],
      }))
    }
  })

  it('asks Git for repository, bare repository, and remote facts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
    const repository = join(root, 'repository')
    const bare = join(root, 'bare.git')
    await mkdir(repository)
    await execFileAsync('git', ['init', repository])
    await execFileAsync('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:one/example.git'])
    await execFileAsync('git', ['-C', repository, 'remote', 'set-url', '--add', 'origin', 'https://github.com/two/example.git'])
    await execFileAsync('git', ['init', '--bare', bare])

    const result = await scanRoot(root, options)
    const canonicalRepository = await realpath(repository)
    const canonicalBare = await realpath(bare)
    const normal = result.projects.find(({ path }) => path === repository)
    const bareProject = result.projects.find(({ path }) => path === bare)

    expect(normal).toEqual(expect.objectContaining({
      kind: 'repository',
      availability: 'available',
      repositoryPath: canonicalRepository,
      remotes: [
        'git@github.com:one/example.git',
        'https://github.com/two/example.git',
      ],
    }))
    expect(normal?.gitCommonDirectory).toContain(join('repository', '.git'))
    expect(bareProject).toEqual(expect.objectContaining({
      kind: 'bare',
      availability: 'available',
      repositoryPath: canonicalBare,
    }))
  })

  it('ranks misspelled names and keeps pinned recents first for an empty query', () => {
    const base: Omit<ProjectRecord, 'id' | 'name' | 'path'> = {
      kind: 'folder',
      availability: 'available',
      remotes: [],
      markers: [],
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      visitCount: 0,
      pinned: false,
      trusted: true,
    }
    const projects: ProjectRecord[] = [
      { ...base, id: '1', name: 'monimal', path: '/src/monimal' },
      { ...base, id: '2', name: 'another', path: '/src/another', pinned: true },
    ]

    expect(rankProjects(projects, 'monmal')[0]?.id).toBe('1')
    expect(rankProjects(projects, '')[0]?.id).toBe('2')
  })

  it('searches every project summary field and respects result limits', () => {
    const base: Omit<ProjectRecord, 'id' | 'name' | 'path'> = {
      kind: 'repository',
      availability: 'available',
      repositoryPath: '/git/common',
      remotes: ['git@github.com:stuffbucket/monimal.git'],
      markers: ['Cargo.toml'],
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      visitCount: 0,
      pinned: false,
      trusted: true,
    }
    const projects: ProjectRecord[] = [
      { ...base, id: 'one', name: 'alpha', path: '/work/alpha' },
      {
        ...base,
        id: 'two',
        name: 'beta',
        path: '/work/beta',
        repositoryPath: '/git/other',
        remotes: [],
        markers: [],
      },
    ]

    expect(rankProjects(projects, 'stuffbucket')[0]?.id).toBe('one')
    expect(rankProjects(projects, 'Cargo')[0]?.id).toBe('one')
    expect(rankProjects(projects, 'common')[0]?.id).toBe('one')
    expect(rankProjects(projects, '  alpha  ')[0]?.id).toBe('one')
    expect(rankProjects(projects, '   ').map(({ id }) => id)).toEqual([
      'one',
      'two',
    ])
    expect(rankProjects(projects, 'alpha', 1)).toHaveLength(1)
    expect(rankProjects(projects, 'not-present')).toEqual([])

    const [combinedFieldMatch] = rankProjects([
      {
        ...base,
        id: 'combined',
        name: 'alpha',
        path: '/work/alpha',
        repositoryPath: '',
        remotes: [],
        markers: [],
      },
    ], 'alpha /work')
    expect(combinedFieldMatch?.score).toBeCloseTo(0.8842132276)
  })

  it('uses recency, visits, and name as deterministic empty-query tie breakers', () => {
    const base: Omit<ProjectRecord, 'id' | 'name' | 'path'> = {
      kind: 'folder',
      availability: 'available',
      remotes: [],
      markers: [],
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      visitCount: 0,
      pinned: false,
      trusted: true,
    }
    const projects: ProjectRecord[] = [
      { ...base, id: 'name-z', name: 'zeta', path: '/zeta' },
      { ...base, id: 'name-a', name: 'alpha', path: '/alpha' },
      { ...base, id: 'visits', name: 'visits', path: '/visits', visitCount: 3 },
      {
        ...base,
        id: 'recent',
        name: 'recent',
        path: '/recent',
        lastOpenedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        ...base,
        id: 'pinned',
        name: 'pinned',
        path: '/pinned',
        pinned: true,
      },
    ]

    expect(rankProjects(projects, '').map(({ id }) => id)).toEqual([
      'pinned',
      'recent',
      'visits',
      'name-a',
      'name-z',
    ])
    expect(rankProjects(projects, '', 2).map(({ id }) => id)).toEqual([
      'pinned',
      'recent',
    ])
    expect(rankProjects([
      { ...base, id: 'z', name: 'zeta', path: '/zeta' },
      { ...base, id: 'a', name: 'alpha', path: '/alpha' },
    ], '').map(({ id }) => id)).toEqual(['a', 'z'])
  })

  it('adds a pinned bonus without changing the project data', () => {
    const base: ProjectRecord = {
      id: 'plain',
      name: 'same',
      path: '/plain',
      kind: 'folder',
      availability: 'available',
      remotes: [],
      markers: [],
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      visitCount: 0,
      pinned: false,
      trusted: true,
    }
    const [plain, pinned] = rankProjects([
      base,
      { ...base, id: 'pinned', path: '/pinned', pinned: true },
    ], 'same')

    expect(pinned?.score).toBeGreaterThan(plain?.score ?? 0)
    expect(pinned?.pinned).toBe(true)
    expect(base).toEqual(expect.objectContaining({ pinned: false }))
  })
})
