import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const TOOL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
)

export interface CloneFile {
  name: string
  start: number
  end: number
}

export interface Clone {
  firstFile: CloneFile
  secondFile: CloneFile
  lines: number
  tokens: number
}

export interface JscpdReport {
  duplicates: Clone[]
  statistics: {
    total: {
      clones: number
      duplicatedLines: number
      lines: number
      percentage: number
      sources: number
    }
  }
}

export async function detectDuplicates({
  root,
  paths,
  config,
}: {
  root: string
  paths: string[]
  config: string
}): Promise<JscpdReport> {
  const output = path.join(os.tmpdir(), `jscpd-${process.pid}-${Date.now()}`)
  const entry = path.join(TOOL_ROOT, "node_modules/jscpd/run-jscpd.js")
  const process_ = Bun.spawn(
    [
      process.execPath,
      entry,
      ...paths,
      "--config",
      config,
      "--absolute",
      "--no-colors",
      "--reporters",
      "json",
      "--output",
      output,
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const [, stderr] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ])
  await process_.exited

  const file = Bun.file(path.join(output, "jscpd-report.json"))
  if (!(await file.exists())) {
    throw new Error(
      `jscpd did not produce a report${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
    )
  }
  const report = (await file.json()) as JscpdReport
  if (!Array.isArray(report.duplicates)) {
    throw new TypeError("jscpd report had no `duplicates` array")
  }
  return report
}

const relativePath = (root: string, absolute: string): string =>
  path
    .relative(fs.realpathSync(root), fs.realpathSync(absolute))
    .replaceAll(path.sep, "/")

export const duplicatePairId = (left: string, right: string): string =>
  [left, right]
    .sort((first, second) => first.localeCompare(second))
    .join(" <-> ")

export function crossFilePairs(
  report: JscpdReport,
  root: string,
): Map<string, Clone[]> {
  const pairs = new Map<string, Clone[]>()
  for (const clone of report.duplicates) {
    const left = relativePath(root, clone.firstFile.name)
    const right = relativePath(root, clone.secondFile.name)
    if (left === right) continue
    const id = duplicatePairId(left, right)
    pairs.set(id, [...(pairs.get(id) ?? []), clone])
  }
  return pairs
}

export function describeClone(clone: Clone, root: string): string {
  const left = relativePath(root, clone.firstFile.name)
  const right = relativePath(root, clone.secondFile.name)
  return (
    `${left}:${clone.firstFile.start}-${clone.firstFile.end}` +
    `  ==  ${right}:${clone.secondFile.start}-${clone.secondFile.end}` +
    `  (${clone.lines} lines, ${clone.tokens} tokens)`
  )
}