const assert = require("node:assert/strict")

const review = require("../dependency-review.json")
const manifest = require("../package.json")

function verifyPackage(pkg, complete = true) {
  const id = `${pkg.name}@${pkg.version}`
  const approved = review.packages[id]
  if (!approved) return pkg
  const lifecycle = Object.fromEntries(
    Object.entries(pkg.scripts ?? {}).filter(([name]) =>
      ["install", "postinstall", "preinstall", "prepare"].includes(name),
    ),
  )
  if (complete || pkg.scripts !== undefined)
    assert.deepEqual(
      lifecycle,
      approved.lifecycle,
      `Settings dependency lifecycle changed: ${id}`,
    )
  if (complete || pkg.license !== undefined)
    assert.equal(
      pkg.license,
      approved.license,
      `Settings dependency license changed: ${id}`,
    )
  return pkg
}

function readPackage(pkg) {
  return verifyPackage(pkg, false)
}

function verifyLockfile(lockfile) {
  const importer = lockfile.importers?.["packages/maximal-settings"]
  assert.ok(importer, "Settings dependency importer is missing")
  const visited = new Set()
  const visit = (id) => {
    if (visited.has(id)) return
    visited.add(id)
    const approved = review.packages[id]
    assert.ok(approved, `Unreviewed settings dependency: ${id}`)
    assert.equal(
      lockfile.packages?.[id]?.resolution?.integrity,
      approved.integrity,
      `Settings dependency integrity changed: ${id}`,
    )
    const snapshot = lockfile.snapshots?.[id] ?? lockfile.packages?.[id]
    assert.ok(snapshot, `Settings dependency snapshot missing: ${id}`)
    const dependencies = {
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    }
    assert.deepEqual(
      dependencies,
      approved.dependencies,
      `Settings dependency graph changed: ${id}`,
    )
    for (const [name, version] of Object.entries(dependencies))
      visit(`${name}@${version}`)
  }
  assert.deepEqual(
    Object.keys(importer.dependencies ?? {}).sort(),
    Object.keys(manifest.dependencies).sort(),
    "Settings manifest and lockfile differ",
  )
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    assert.match(
      version,
      /^\d+\.\d+\.\d+$/,
      `Settings dependency must be exact: ${name}`,
    )
    const dependency = importer.dependencies[name]
    const specifier =
      typeof dependency === "string" ?
        importer.specifiers?.[name]
      : dependency?.specifier
    const resolved =
      typeof dependency === "string" ? dependency : dependency?.version
    assert.equal(
      specifier,
      version,
      `Settings dependency specifier changed: ${name}`,
    )
    assert.equal(
      resolved,
      version,
      `Settings dependency resolution changed: ${name}`,
    )
    visit(`${name}@${version}`)
  }
  assert.deepEqual(
    [...visited].sort(),
    Object.keys(review.packages).sort(),
    "Settings dependency review contains stale entries",
  )
}

module.exports = { readPackage, verifyPackage, verifyLockfile, review }
