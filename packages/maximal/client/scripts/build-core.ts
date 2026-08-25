import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { assertGenericProviderBundle } from '../../scripts/build'

interface CorePackage {
  version: string
}

const coreRoot = resolve('node_modules/@stuffbucket/maximal-core')
const corePackage = JSON.parse(readFileSync(resolve(coreRoot, 'package.json'), 'utf8')) as CorePackage

// Provenance for the compiled sidecar. This used to be parsed out of
// package-lock.json, which recorded the git URL maximal-core was once installed
// from. In a workspace that is wrong twice over: the lockfile is not what pnpm
// installs from, and the SHA it carried named a commit that is not what gets
// compiled -- coreRoot is a symlink to packages/maximal-core, so the code came
// from THIS checkout. A filtered Docker build has no usable host worktree, so it
// passes the already-validated checkout SHA explicitly; native builds ask git.
const explicitGitSha = process.env.MAXIMAL_GIT_SHA?.trim()
if (explicitGitSha && !/^[0-9a-f]{40}$/.test(explicitGitSha)) {
  throw new Error('MAXIMAL_GIT_SHA must be a lowercase 40-character Git SHA')
}
const head =
  explicitGitSha ? null : spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
const gitSha = explicitGitSha || (head?.status === 0 ? head.stdout.trim() : '')
const spec = process.env.MAXIMAL_CORE_REF || `v${corePackage.version}`
const channel = corePackage.version.includes('-') ? corePackage.version.split('-', 2)[1].split('.', 1)[0] : 'stable'
const output = resolve(process.env.MAXIMAL_CORE_OUT || 'resources/bin/maximal-core')
const compileTarget = process.env.MAXIMAL_CORE_TARGET?.trim() || 'bun-darwin-arm64'
if (!/^bun(?:-(?:darwin|linux)-(?:arm64|x64))?$/.test(compileTarget)) {
  throw new Error(`Unsupported MAXIMAL_CORE_TARGET: ${compileTarget}`)
}
const metafile = `${output}.metafile.json`
const compositionEntry = resolve(import.meta.dirname, '../../src/main.ts')

mkdirSync(dirname(output), { recursive: true })

const args = [
  'build',
  '--compile',
  '--compile-autoload-package-json',
  '--minify',
  '--sourcemap',
  `--target=${compileTarget}`,
  `--metafile=${metafile}`,
  '--define',
  `__MAXIMAL_VERSION__=${JSON.stringify(corePackage.version)}`,
  '--define',
  `__MAXIMAL_GIT_SHA__=${JSON.stringify(gitSha)}`,
  '--define',
  `__MAXIMAL_GIT_BRANCH__=${JSON.stringify(spec)}`,
  '--define',
  `__MAXIMAL_CHANNEL__=${JSON.stringify(channel)}`,
  compositionEntry,
  '--outfile',
  output,
]

console.log(`Building maximal-core ${corePackage.version} (${gitSha.slice(0, 12) || 'unknown revision'})`)
const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) {
  rmSync(metafile, { force: true })
  process.exit(result.status ?? 1)
}

try {
  const metadata: unknown = JSON.parse(readFileSync(metafile, 'utf8'))
  assertGenericProviderBundle(metadata)
} catch (error) {
  rmSync(output, { force: true })
  throw error
} finally {
  rmSync(metafile, { force: true })
}
