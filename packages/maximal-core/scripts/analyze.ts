import fs from "node:fs"
import path from "node:path"

import {
  packageCycleEdges,
  packageRuleViolations,
  readArchitecturePolicy,
  readPackageGraph,
} from "../../../scripts/architecture-graph.mjs"
import { cruise, cycleEdges } from "./analysis/cycles"
import {
  crossFilePairs,
  describeClone,
  detectDuplicates,
} from "./analysis/duplicates"
import { ratchetChanges } from "./analysis/ratchet"

const TOOL_ROOT = path.resolve(import.meta.dir, "..")
const WORKSPACE_ROOT = path.resolve(TOOL_ROOT, "../..")
const PACKAGE_ROOT = process.cwd()
const LIST = process.argv.includes("--list")
const policy = readArchitecturePolicy(WORKSPACE_ROOT)
const manifest = await Bun.file(path.join(PACKAGE_ROOT, "package.json")).json()
const packagePolicy = policy.packages[manifest.name]

if (!packagePolicy || path.resolve(WORKSPACE_ROOT, packagePolicy.root) !== PACKAGE_ROOT) {
  throw new Error(`architecture analysis is not configured for ${manifest.name}`)
}

async function runCommand(
  arguments_: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const process_ = Bun.spawn(arguments_, {
    cwd: PACKAGE_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ])
  const exitCode = await process_.exited
  if (exitCode !== 0) throw new Error(`${stdout}${stderr}`.trim())
  return `${stdout}${stderr}`.trim()
}

async function runKnip(): Promise<string> {
  const entry = path.join(TOOL_ROOT, "node_modules/knip/bin/knip-bun.js")
  return runCommand([process.execPath, entry], {
    ...process.env,
    MONIMAL_ARCHITECTURE_ANALYSIS: "1",
  })
}

async function runCycles(): Promise<string> {
  if (packagePolicy.existingRatchets) {
    return runCommand([
      process.execPath,
      path.join(TOOL_ROOT, "scripts/check-deps.ts"),
      ...(LIST ? ["--list"] : []),
    ])
  }
  if (!fs.existsSync(path.join(PACKAGE_ROOT, "src"))) return "cycles: no src tree"
  const result = await cruise({
    root: PACKAGE_ROOT,
    paths: ["src"],
    config: path.join(TOOL_ROOT, "dependency-cruiser-analysis.mjs"),
  })
  const edges = cycleEdges(result)
  const current = [...edges.keys()].sort()
  if (LIST) return `cycle edges:\n${current.map((edge) => `  ${edge}`).join("\n") || "  (none)"}`

  const { added, gone } = ratchetChanges(current, packagePolicy.cycleEdges)
  if (added.length || gone.length) {
    throw new Error(
      [
        ...added.map((edge) => `new source cycle edge: ${edge}`),
        ...gone.map((edge: string) => `removed source cycle edge: ${edge}; shrink architecture-analysis.json`),
      ].join("\n"),
    )
  }
  return `cycles: ${current.length} recorded edge(s)`
}

async function runDuplicates(): Promise<string> {
  if (packagePolicy.existingRatchets) {
    return runCommand([
      process.execPath,
      path.join(TOOL_ROOT, "scripts/check-dupes.ts"),
      ...(LIST ? ["--list"] : []),
    ])
  }
  if (!fs.existsSync(path.join(PACKAGE_ROOT, "src"))) return "duplicates: no src tree"
  const paths = LIST
    ? ["src", "tests", "scripts"].filter((candidate) =>
        fs.existsSync(path.join(PACKAGE_ROOT, candidate)),
      )
    : ["src"]
  const report = await detectDuplicates({
    root: PACKAGE_ROOT,
    paths,
    config: path.join(TOOL_ROOT, ".jscpd.json"),
  })
  const pairs = crossFilePairs(report, PACKAGE_ROOT)
  if (LIST) {
    const clones = [...pairs.entries()].flatMap(([id, matches]) => [
      `  ${id}`,
      ...matches.map((clone) => `    ${describeClone(clone, PACKAGE_ROOT)}`),
    ])
    return `cross-file duplicate pairs:\n${clones.join("\n") || "  (none)"}`
  }

  const current = [...pairs.keys()].sort()
  const { added, gone } = ratchetChanges(current, packagePolicy.duplicatePairs)
  if (added.length || gone.length) {
    throw new Error(
      [
        ...added.map((pair) => `new production duplicate pair: ${pair}`),
        ...gone.map((pair: string) => `removed production duplicate pair: ${pair}; shrink architecture-analysis.json`),
      ].join("\n"),
    )
  }
  return `duplicates: ${current.length} recorded pair(s), ${report.statistics.total.percentage.toFixed(2)}% overall`
}

async function runPackageGraph(): Promise<string> {
  if (manifest.name !== "@stuffbucket/maximal-core") return ""
  const graph = readPackageGraph(WORKSPACE_ROOT, policy)
  const cycles = packageCycleEdges(graph)
  const violations = packageRuleViolations(graph, policy.packageRules)
  if (cycles.size || violations.length) {
    throw new Error(
      [
        ...[...cycles.values()].map(
          (edge) => `package cycle: ${edge.from} -[${edge.kind}]-> ${edge.to}`,
        ),
        ...violations,
      ].join("\n"),
    )
  }
  return `package graph: ${graph.packages.size} packages, ${graph.edges.length} edges, no cycles`
}

const checks = [runKnip(), runCycles(), runDuplicates(), runPackageGraph()]
const results = await Promise.allSettled(checks)
let failed = false
for (const [index, result] of results.entries()) {
  if (result.status === "fulfilled") {
    if (result.value) console.log(result.value)
  } else {
    failed = true
    console.error(`analysis check ${index + 1} failed:\n${String(result.reason)}`)
  }
}
if (failed) process.exit(1)