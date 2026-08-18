import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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
// from THIS checkout. Ask git for the commit that actually produced it.
const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
const gitSha = head.status === 0 ? head.stdout.trim() : ''
const spec = process.env.MAXIMAL_CORE_REF || `v${corePackage.version}`
const channel = corePackage.version.includes('-') ? corePackage.version.split('-', 2)[1].split('.', 1)[0] : 'stable'
const output = resolve(process.env.MAXIMAL_CORE_OUT || 'resources/bin/maximal-core')

mkdirSync(dirname(output), { recursive: true })

const args = [
  'build',
  '--compile',
  '--minify',
  '--sourcemap',
  '--target=bun-darwin-arm64',
  '--define',
  `__MAXIMAL_VERSION__=${JSON.stringify(corePackage.version)}`,
  '--define',
  `__MAXIMAL_GIT_SHA__=${JSON.stringify(gitSha)}`,
  '--define',
  `__MAXIMAL_GIT_BRANCH__=${JSON.stringify(spec)}`,
  '--define',
  `__MAXIMAL_CHANNEL__=${JSON.stringify(channel)}`,
  resolve(coreRoot, 'src/main.ts'),
  '--outfile',
  output,
]

console.log(`Building maximal-core ${corePackage.version} (${gitSha.slice(0, 12) || 'unknown revision'})`)
const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
