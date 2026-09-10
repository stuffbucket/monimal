import path from "node:path"
import { fileURLToPath } from "node:url"

const TOOL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
)

export interface CycleStep {
  name: string
}

export interface CruiseDependency {
  resolved: string
  circular?: boolean
  cycle?: CycleStep[]
  dependencyTypes?: string[]
}

export interface CruisedModule {
  source: string
  dependencies: CruiseDependency[]
}

export interface CruiseViolation {
  from: string
  to: string
  rule: { name: string; severity: string }
}

export interface CruiseResult {
  modules: CruisedModule[]
  summary: {
    violations: CruiseViolation[]
    totalCruised: number
    totalDependenciesCruised: number
  }
}

export async function cruise({
  root,
  paths,
  config,
}: {
  root: string
  paths: string[]
  config?: string
}): Promise<CruiseResult> {
  const entry = path.join(
    TOOL_ROOT,
    "node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
  )
  const arguments_ = [entry]
  if (config) arguments_.push("--config", config)
  arguments_.push("--output-type", "json", ...paths)
  const process_ = Bun.spawn([process.execPath, ...arguments_], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ])
  await process_.exited

  try {
    const parsed: unknown = JSON.parse(stdout)
    const result = parsed as CruiseResult
    if (!Array.isArray(result.modules)) throw new Error("no `modules` array")
    return result
  } catch (error) {
    throw new Error(
      `dependency-cruiser did not produce a usable report${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
      { cause: error },
    )
  }
}

export const cycleEdgeId = (from: string, to: string): string =>
  `${from} -> ${to}`

export function cycleEdges(result: CruiseResult): Map<string, string[]> {
  const edges = new Map<string, string[]>()
  for (const module of result.modules) {
    for (const dependency of module.dependencies) {
      if (!dependency.circular) continue
      const id = cycleEdgeId(module.source, dependency.resolved)
      if (edges.has(id)) continue
      edges.set(id, [
        module.source,
        ...(dependency.cycle ?? []).map((step) => step.name),
      ])
    }
  }
  return edges
}

export function cycleComponents(ids: string[]): string[][] {
  const parent = new Map<string, string>()
  const find = (node: string): string => {
    let root = parent.get(node) ?? node
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root
    parent.set(node, root)
    return root
  }
  const union = (left: string, right: string): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot)
  }
  for (const id of ids) {
    const [from, to] = id.split(" -> ")
    if (!from || !to) continue
    parent.set(from, parent.get(from) ?? from)
    parent.set(to, parent.get(to) ?? to)
    union(from, to)
  }
  const groups = new Map<string, string[]>()
  for (const node of parent.keys()) {
    const root = find(node)
    groups.set(root, [...(groups.get(root) ?? []), node])
  }
  return [...groups.values()]
    .map((group) => group.sort())
    .sort(
      (left, right) =>
        right.length - left.length ||
        (left[0] ?? "").localeCompare(right[0] ?? ""),
    )
}