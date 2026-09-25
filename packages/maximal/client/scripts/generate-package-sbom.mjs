#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { renderPlainTextLicenses } from '../../scripts/render-license-bundle.mjs'

const [buildPath, sidecarRoot, sidecarMetafilePath, cdxgenCli] = process.argv.slice(2)
if (
  buildPath === undefined ||
  sidecarRoot === undefined ||
  sidecarMetafilePath === undefined ||
  cdxgenCli === undefined
) {
  throw new Error('Expected build path, sidecar root, sidecar metafile, and cdxgen CLI path.')
}

const registry = execFileSync('pnpm', ['config', 'get', 'registry'], {
  cwd: sidecarRoot,
  encoding: 'utf8',
}).trim()
const registryUrl = new URL(registry)
if (!['http:', 'https:'].includes(registryUrl.protocol)) {
  throw new Error(`Expected an HTTP(S) package registry, received ${registryUrl.protocol}`)
}

function runCdxgen(projectPath, outputPath) {
  execFileSync(process.execPath, [
    cdxgenCli,
    '--type', 'js',
    '--no-recurse',
    '--no-install-deps',
    '--required-only',
    '--profile', 'license-compliance',
    '--json-pretty',
    '--output', outputPath,
    projectPath,
  ], {
    env: {
      ...process.env,
      NPM_CONFIG_REGISTRY: registryUrl.href,
      NPM_URL: registryUrl.href,
    },
    stdio: 'inherit',
  })
}

function componentKey(component) {
  const name = component.group ? `${component.group}/${component.name}` : component.name
  return `${name}@${component.version}`
}

function componentFromPackage(packageRoot) {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  const separator = manifest.name.startsWith('@') ? manifest.name.indexOf('/') : -1
  const group = separator === -1 ? undefined : manifest.name.slice(0, separator)
  const name = separator === -1 ? manifest.name : manifest.name.slice(separator + 1)
  const purlName = group === undefined
    ? encodeURIComponent(name)
    : `${encodeURIComponent(group)}/${encodeURIComponent(name)}`
  const purl = `pkg:npm/${purlName}@${encodeURIComponent(manifest.version)}`
  const license = typeof manifest.license === 'string' ? manifest.license : undefined
  const licenses = license === undefined
    ? undefined
    : /^[A-Za-z0-9.+-]+$/u.test(license)
      ? [{ license: { id: license } }]
      : [{ expression: license }]
  return {
    ...(group === undefined ? {} : { group }),
    name,
    version: manifest.version,
    ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
    ...(licenses === undefined ? {} : { licenses }),
    purl,
    type: 'library',
    'bom-ref': purl.replace('%40', '@'),
  }
}

function readPackageRoot(packageRoot, packages) {
  const manifestPath = path.join(packageRoot, 'package.json')
  if (!existsSync(manifestPath)) return
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') return
  packages.set(`${manifest.name}@${manifest.version}`, packageRoot)
}

function indexNodeModules(modulesRoot) {
  const packages = new Map()

  function visitPackage(packageRoot) {
    readPackageRoot(packageRoot, packages)
    const nestedModules = path.join(packageRoot, 'node_modules')
    if (existsSync(nestedModules)) visitModules(nestedModules)
  }

  function visitModules(currentModules) {
    for (const entry of readdirSync(currentModules, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const entryPath = path.join(currentModules, entry.name)
      if (entry.name.startsWith('@')) {
        for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
          if (scopedEntry.isDirectory()) visitPackage(path.join(entryPath, scopedEntry.name))
        }
      } else {
        visitPackage(entryPath)
      }
    }
  }

  if (existsSync(modulesRoot)) visitModules(modulesRoot)
  return packages
}

function indexSidecarInputs(packageRoot, metafilePath) {
  const packages = new Map()
  const metafile = JSON.parse(readFileSync(metafilePath, 'utf8'))
  if (metafile.inputs === null || typeof metafile.inputs !== 'object') {
    throw new TypeError('Sidecar metafile has no input graph.')
  }
  const boundary = path.resolve(packageRoot, '../..')
  const inputRoot = path.dirname(path.dirname(metafilePath))
  for (const input of Object.keys(metafile.inputs)) {
    let current = path.dirname(path.resolve(inputRoot, input))
    while (current.startsWith(`${boundary}${path.sep}`)) {
      if (existsSync(path.join(current, 'package.json'))) {
        readPackageRoot(current, packages)
        break
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return packages
}

function readLicenseText(packageRoot) {
  const licenseFiles = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/iu.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
  const sections = licenseFiles
    .map((file) => ({ file, content: readFileSync(path.join(packageRoot, file), 'utf8').trim() }))
    .filter(({ content }) => content.length > 0)
  if (sections.length === 0) return undefined
  if (sections.length === 1) return sections[0].content
  return sections.map(({ file, content }) => `===== ${file} =====\n\n${content}`).join('\n\n')
}

function enrichLicenseText(component, packageRoot) {
  const content = readLicenseText(packageRoot)
  if (content === undefined) return component
  const licenses = Array.isArray(component.licenses) ? structuredClone(component.licenses) : []
  let licenseEntry = licenses.find((entry) => entry.license !== undefined)
  if (licenseEntry === undefined) {
    licenseEntry = { license: { name: 'Package license' } }
    licenses.push(licenseEntry)
  }
  licenseEntry.license.text = { content, contentType: 'text/plain' }
  return { ...component, licenses }
}

function mergeBoms(applicationBom, sidecarBom, applicationPackages, sidecarPackages) {
  const components = new Map()
  const applicationCandidates = (applicationBom.components ?? [])
    .filter((component) => applicationPackages.has(componentKey(component)))
  const sidecarMetadata = new Map(
    (sidecarBom.components ?? []).map((component) => [componentKey(component), component]),
  )
  const sidecarCandidates = [...sidecarPackages]
    .map(([key, packageRoot]) => sidecarMetadata.get(key) ?? componentFromPackage(packageRoot))
  if (applicationCandidates.length === 0 || sidecarCandidates.length === 0) {
    throw new Error(
      `Runtime SBOM filtering found ${String(applicationCandidates.length)} Electron and ` +
        `${String(sidecarCandidates.length)} sidecar components.`,
    )
  }
  const candidates = [...applicationCandidates, ...sidecarCandidates]
  const packageRoots = new Map([...sidecarPackages, ...applicationPackages])
  for (const candidate of candidates) {
    const packageRoot = packageRoots.get(componentKey(candidate))
    const component = packageRoot === undefined ? candidate : enrichLicenseText(candidate, packageRoot)
    const reference = component['bom-ref'] ?? component.purl
    if (typeof reference === 'string') components.set(reference, component)
  }

  const dependencies = new Map()
  for (const dependency of [...(applicationBom.dependencies ?? []), ...(sidecarBom.dependencies ?? [])]) {
    if (typeof dependency.ref !== 'string') continue
    const existing = dependencies.get(dependency.ref) ?? new Set()
    for (const reference of dependency.dependsOn ?? []) existing.add(reference)
    dependencies.set(dependency.ref, existing)
  }

  return {
    ...applicationBom,
    components: [...components.values()].sort((left, right) =>
      String(left.purl ?? '').localeCompare(String(right.purl ?? '')),
    ),
    dependencies: [...dependencies.entries()]
      .map(([ref, dependsOn]) => ({ ref, dependsOn: [...dependsOn].sort() }))
      .sort((left, right) => left.ref.localeCompare(right.ref)),
  }
}

const applicationBomPath = path.join(buildPath, 'app.cdx.json')
const sidecarBomPath = path.join(buildPath, 'sidecar.cdx.json')
const outputPath = path.join(buildPath, 'SBOM.cdx.json')

runCdxgen(buildPath, applicationBomPath)
runCdxgen(sidecarRoot, sidecarBomPath)

const applicationBom = JSON.parse(readFileSync(applicationBomPath, 'utf8'))
const sidecarBom = JSON.parse(readFileSync(sidecarBomPath, 'utf8'))
const applicationPackages = indexNodeModules(path.join(buildPath, 'node_modules'))
const sidecarPackages = indexSidecarInputs(sidecarRoot, sidecarMetafilePath)
writeFileSync(
  outputPath,
  `${JSON.stringify(mergeBoms(applicationBom, sidecarBom, applicationPackages, sidecarPackages), null, 2)}\n`,
)
rmSync(applicationBomPath)
rmSync(sidecarBomPath)
await renderPlainTextLicenses(buildPath, {
  fallbackPath: null,
  outputPath: path.join(buildPath, 'THIRD-PARTY-LICENSES.txt'),
  sbomPath: outputPath,
})