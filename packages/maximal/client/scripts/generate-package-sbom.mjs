#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { renderPlainTextLicenses } from '../../scripts/render-license-bundle.mjs'

const [buildPath, sidecarRoot, cdxgenCli] = process.argv.slice(2)
if (buildPath === undefined || sidecarRoot === undefined || cdxgenCli === undefined) {
  throw new Error('Expected build path, sidecar root, and cdxgen CLI path.')
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
  ], { stdio: 'inherit' })
}

function mergeBoms(applicationBom, sidecarBom) {
  const components = new Map()
  for (const component of [...(applicationBom.components ?? []), ...(sidecarBom.components ?? [])]) {
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
writeFileSync(outputPath, `${JSON.stringify(mergeBoms(applicationBom, sidecarBom), null, 2)}\n`)
rmSync(applicationBomPath)
rmSync(sidecarBomPath)
await renderPlainTextLicenses(buildPath, {
  fallbackPath: null,
  outputPath: path.join(buildPath, 'THIRD-PARTY-LICENSES.txt'),
  sbomPath: outputPath,
})