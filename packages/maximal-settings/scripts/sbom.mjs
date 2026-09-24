import assert from "node:assert/strict"
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

import policy from "./dependency-policy.cjs"

policy.verifyLockfile(
  parse(
    readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8"),
  ),
)
const rootPath = fileURLToPath(new URL("../package.json", import.meta.url))
const root = JSON.parse(readFileSync(rootPath, "utf8"))
const components = new Map()
const dependencies = []
const ref = (pkg) => `pkg:npm/${pkg.name.replace("@", "%40")}@${pkg.version}`
const visit = (manifestPath, isRoot = false) => {
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"))
  const id = `${pkg.name}@${pkg.version}`
  if (components.has(id)) return ref(pkg)
  if (!isRoot) {
    const approved = policy.review.packages[id]
    assert.ok(approved, `Unreviewed installed settings dependency: ${id}`)
    policy.verifyPackage(pkg)
    const hashes = [
      {
        alg: "SHA-1",
        content: Buffer.from(approved.integrity.slice(5), "base64").toString(
          "hex",
        ),
      },
    ]
    if (approved.reviewedTarballSha512)
      hashes.push({ alg: "SHA-512", content: approved.reviewedTarballSha512 })
    components.set(id, {
      type: "library",
      "bom-ref": ref(pkg),
      name: pkg.name,
      version: pkg.version,
      purl: ref(pkg),
      licenses: [{ license: { id: approved.license } }],
      hashes,
      properties: [
        {
          name: "settings:reviewed-lifecycle",
          value: JSON.stringify(approved.lifecycle),
        },
      ],
    })
  }
  const require = createRequire(manifestPath)
  const children = Object.keys({
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
  })
    .sort()
    .map((name) => {
      const child = require.resolve
        .paths(name)
        ?.map((directory) => join(directory, name, "package.json"))
        .find(existsSync)
      assert.ok(child, `Installed settings dependency is missing: ${name}`)
      return visit(realpathSync(child))
    })
  dependencies.push({ ref: ref(pkg), dependsOn: children })
  return ref(pkg)
}
visit(rootPath, true)
assert.deepEqual(
  [...components.keys()].sort(),
  Object.keys(policy.review.packages).sort(),
)
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "library",
      name: root.name,
      version: root.version,
      "bom-ref": ref(root),
    },
  },
  components: [...components.values()].sort((left, right) =>
    left.purl.localeCompare(right.purl),
  ),
  dependencies: dependencies.sort((left, right) =>
    left.ref.localeCompare(right.ref),
  ),
}
const output = new URL("../SBOM.cdx.json", import.meta.url)
const serialized = JSON.stringify(bom, null, 2) + "\n"
if (process.argv.includes("--check"))
  assert.equal(
    readFileSync(output, "utf8"),
    serialized,
    "Settings SBOM is stale",
  )
else writeFileSync(output, serialized)
console.log(`Settings SBOM: ${components.size} reviewed production components`)
