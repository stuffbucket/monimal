import fs from "node:fs"
import path from "node:path"

const DEPENDENCY_KINDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
]

export function readArchitecturePolicy(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "architecture-analysis.json"), "utf8"),
  )
}

export function readPackageGraph(root, policy = readArchitecturePolicy(root)) {
  const packages = new Map()
  for (const [expectedName, options] of Object.entries(policy.packages)) {
    const manifestPath = path.join(root, options.root, "package.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    if (manifest.name !== expectedName) {
      throw new Error(
        `${options.root}/package.json is ${manifest.name}, expected ${expectedName}`,
      )
    }
    packages.set(expectedName, { ...options, manifest })
  }

  const edges = []
  for (const [from, pkg] of packages) {
    for (const kind of DEPENDENCY_KINDS) {
      for (const to of Object.keys(pkg.manifest[kind] ?? {})) {
        edges.push({ from, to, kind })
      }
    }
  }
  return { packages, edges }
}

export function packageCycleEdges(graph) {
  const adjacency = new Map()
  for (const edge of graph.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge])
  }

  const cycleEdges = new Map()
  const reaches = (start, target, visited = new Set()) => {
    if (start === target) return true
    if (visited.has(start)) return false
    visited.add(start)
    return (adjacency.get(start) ?? []).some((edge) =>
      reaches(edge.to, target, visited),
    )
  }
  for (const edge of graph.edges) {
    if (reaches(edge.to, edge.from)) {
      cycleEdges.set(`${edge.from} -> ${edge.to}`, edge)
    }
  }
  return cycleEdges
}

export function packageRuleViolations(graph, rules) {
  const declared = new Map()
  for (const edge of graph.edges) {
    const id = `${edge.from} -> ${edge.to}`
    declared.set(id, [...(declared.get(id) ?? []), edge.kind])
  }
  const violations = []
  for (const rule of rules.deny) {
    for (const from of rule.from) {
      for (const to of rule.to) {
        const id = `${from} -> ${to}`
        const kinds = declared.get(id)
        if (kinds) {
          violations.push(`forbidden ${id} (${kinds.sort().join(", ")})`)
        }
      }
    }
  }
  for (const rule of rules.require) {
    for (const to of rule.to) {
      if (!declared.has(`${rule.from} -> ${to}`)) {
        violations.push(`required ${rule.from} -> ${to} is missing`)
      }
    }
  }
  return violations
}