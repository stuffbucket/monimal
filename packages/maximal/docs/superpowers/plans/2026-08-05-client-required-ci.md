# Client Required CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing required `CI / test` status fail when the Electron client cannot install, typecheck, build its core sidecar, package, or embed the exact staged sidecar.

**Architecture:** Extend the existing required job instead of creating a new status that branch rules may not require. Keep npm responsible for the Electron client and the repository-pinned Bun responsible only for compiling maximal-core.

**Tech Stack:** npm, Node.js, Bun, Electron Forge, GitHub Actions.

## Global Constraints

- Implement from an isolated worktree based on the branch that contains `client/`; the current documentation checkout does not contain it.
- Do not touch the dirty primary checkout or unrelated client feature work.
- Keep the first lane Ubuntu-only and inside the existing required `test` job.
- Do not add runtime HTTP/SSE smoke, Vitest, lint migration, GUI automation, an OS matrix, installers, or a separate CI job.
- Pin GitHub source dependencies to immutable HTTPS archives; CI must not require SSH credentials.
- Report only commands actually run.

---

### Task 1: Make client installation immutable and clean-checkout-safe

**Files:**
- Modify: `/Users/brian/github/stuffbucket/maximal/client/package.json`
- Modify: `/Users/brian/github/stuffbucket/maximal/client/package-lock.json`

**Interfaces:**
- Produces: Anonymous npm installation at the exact revisions already selected by the lockfile.
- Produces: `npm run build:core`, which creates `resources/bin/` before compiling.

- [ ] **Step 1: Replace mutable/SSH-prone dependency specs**

In `client/package.json`, use the exact existing locked commits:

```json
{
  "dependencies": {
    "stuffbucket-electron": "https://codeload.github.com/stuffbucket/maximal-electron/tar.gz/fe3ca59949c191f86031bc15585855589477e6de"
  },
  "devDependencies": {
    "@electron/node-gyp": "https://codeload.github.com/electron/node-gyp/tar.gz/06b29aafb7708acef8b3669835c8a7857ebc92d2",
    "@stuffbucket/maximal-core": "https://codeload.github.com/stuffbucket/maximal-core/tar.gz/d607485f8f93164c7174d054bdb1f01aa2b3534d"
  },
  "overrides": {
    "@electron/node-gyp": "$@electron/node-gyp"
  }
}
```

Merge these keys into the existing objects; do not replace unrelated dependencies.

- [ ] **Step 2: Make sidecar output creation explicit**

Replace the existing `build:core` script with:

```json
"build:core": "node -e \"require('node:fs').mkdirSync('resources/bin',{recursive:true})\" && bun build --compile node_modules/@stuffbucket/maximal-core/src/main.ts --outfile resources/bin/maximal-core"
```

This first lane targets Ubuntu. Platform-specific names and Bun compile targets are out of scope.

- [ ] **Step 3: Regenerate only the lockfile**

Run from `client/`:

```bash
npm install --package-lock-only --ignore-scripts
```

Expected: `package-lock.json` records the immutable codeload archives.

- [ ] **Step 4: Verify the lock contains no SSH GitHub resolution**

Run:

```bash
rg -n 'git\+ssh:|ssh://|git@github\.com' package-lock.json
```

Expected: no output and exit status 1 because no forbidden resolution remains.

- [ ] **Step 5: Verify clean npm installation and core build**

In the fresh worktree, run:

```bash
npm ci
npm run typecheck
npm run build:core
```

Expected: installation succeeds without SSH credentials; typecheck passes; `resources/bin/maximal-core` is created and non-empty.

- [ ] **Step 6: Commit dependency and build preparation**

```bash
git add client/package.json client/package-lock.json
git commit -m "build(client): make CI inputs reproducible"
```

### Task 2: Prove Forge embeds the staged sidecar

**Files:**
- Create: `/Users/brian/github/stuffbucket/maximal/client/scripts/verify-package.mjs`
- Modify: `/Users/brian/github/stuffbucket/maximal/client/package.json`

**Interfaces:**
- Consumes: staged `resources/bin/maximal-core` and Forge output under `out/`.
- Produces: `npm run verify:package`; success means exactly one packaged sidecar exists and its SHA-256 matches the staged file.

- [ ] **Step 1: Add the verifier script**

Create `client/scripts/verify-package.mjs`:

```js
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const staged = join('resources', 'bin', 'maximal-core')
const outRoot = 'out'
const expectedSuffix = join('resources', 'bin', 'maximal-core')

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (entry.isFile()) files.push(path)
  }

  return files
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

const stagedStat = await stat(staged)
if (stagedStat.size === 0) throw new Error(`staged sidecar is empty: ${staged}`)

const matches = (await filesUnder(outRoot)).filter((path) =>
  relative(outRoot, path).endsWith(expectedSuffix),
)

if (matches.length !== 1) {
  throw new Error(
    `expected exactly one packaged ${expectedSuffix}, found ${matches.length}: ${matches.join(', ')}`,
  )
}

const packaged = matches[0]
const packagedStat = await stat(packaged)
if (packagedStat.size === 0) throw new Error(`packaged sidecar is empty: ${packaged}`)

const stagedHash = await sha256(staged)
const packagedHash = await sha256(packaged)
if (stagedHash !== packagedHash) {
  throw new Error(
    `packaged sidecar differs from staged sidecar: ${stagedHash} != ${packagedHash}`,
  )
}

console.log(`verified packaged sidecar: ${packaged}`)
console.log(`sha256: ${packagedHash}`)
```

- [ ] **Step 2: Expose the verifier and local CI sequence**

Merge these scripts into `client/package.json`:

```json
{
  "scripts": {
    "verify:package": "node scripts/verify-package.mjs",
    "check:ci": "npm run typecheck && npm run build:core && npm run package && npm run verify:package"
  }
}
```

- [ ] **Step 3: Verify the script fails before packaging**

From a fresh worktree before `out/` exists, run:

```bash
npm run verify:package
```

Expected: non-zero exit because no packaged sidecar exists. This proves the verifier cannot pass on the staged binary alone.

- [ ] **Step 4: Package and verify byte identity**

Run:

```bash
npm run package
npm run verify:package
```

Expected: Forge produces one packaged `resources/bin/maximal-core`; the verifier prints its path and matching SHA-256.

- [ ] **Step 5: Commit package verification**

```bash
git add client/scripts/verify-package.mjs client/package.json
git commit -m "test(client): verify packaged core artifact"
```

### Task 3: Add the client lane to the existing required CI status

**Files:**
- Modify: `/Users/brian/github/stuffbucket/maximal/.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `client/package-lock.json`, repository-pinned Bun, and `npm run check:ci` from Task 2.
- Produces: Client failure fails the existing `CI / test` check on pull requests and merge groups.

- [ ] **Step 1: Add npm cache metadata to the existing Node setup**

Extend the existing `actions/setup-node@v6` step:

```yaml
with:
  node-version: 24
  cache: npm
  cache-dependency-path: client/package-lock.json
```

Retain the existing repository Node version if it differs; add only the cache keys.

- [ ] **Step 2: Add unconditional client steps after Node and Bun setup**

Add:

```yaml
- name: Install Electron client dependencies
  working-directory: client
  run: npm ci

- name: Verify Electron client package
  working-directory: client
  run: npm run check:ci
```

Do not add path filters or a separate job. The existing job already runs for pull requests and `merge_group` and is already the required status.

- [ ] **Step 3: Validate workflow and run the local sequence**

Run:

```bash
actionlint .github/workflows/ci.yml
npm --prefix client ci
npm --prefix client run typecheck
npm --prefix client run build:core
npm --prefix client run package -- --platform=linux --arch=x64
npm --prefix client run verify:package
```

Expected: workflow lint passes; frozen install, typecheck, core build, Linux package, and sidecar hash verification all pass. On the Ubuntu CI runner, the workflow itself uses `npm run check:ci` and produces the same native-Linux package path.

- [ ] **Step 4: Commit CI wiring**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: require Electron client packaging"
```

### Task 4: Independent evidence review

**Files:**
- Review only.

**Interfaces:**
- Consumes: base-to-head diff and claim that the required status proves clean install and exact sidecar embedding.
- Produces: concrete findings or verified no-finding result.

- [ ] **Step 1: Dispatch a fresh read-only reviewer**

Require the reviewer to attempt these refutations:

```text
- npm still requires SSH credentials
- a mutable branch/tag remains in the lock
- build:core relies on a pre-existing ignored directory
- verifier can pass with zero or multiple packaged sidecars
- verifier hashes the wrong file
- client checks do not run on pull_request or merge_group
- a new unrequired status was accidentally introduced
```

- [ ] **Step 2: Apply confirmed fixes and rerun the exact local sequence**

A separate implementation agent applies confirmed fixes. Rerun:

```bash
actionlint .github/workflows/ci.yml
npm --prefix client ci
npm --prefix client run check:ci
```

Stop after two failed repair attempts and surface the premise.
