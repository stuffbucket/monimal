import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { ESLint } from "eslint"
import tseslint from "typescript-eslint"

import { unsafeTypeAssertionsPlugin } from "../unsafe-type-assertions.js"

const ROOT = path.resolve(import.meta.dirname, "../../..")
const BASELINE_PATH = path.join(ROOT, "unsafe-type-assertions-baseline.json")
const RULE_ID = "maximal-model-policy/no-unsafe-type-assertions"
const SCANNABLE_EXTENSIONS = new Set([".ts", ".tsx"])
const GENERATED_SEGMENTS = new Set([
  ".claude",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "reports",
])

function trackedFiles(root = ROOT) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
  return output.split("\0").filter(Boolean).sort()
}

export function isScannablePath(relativePath) {
  return SCANNABLE_EXTENSIONS.has(path.extname(relativePath))
    && !relativePath
      .split("/")
      .some((segment) => GENERATED_SEGMENTS.has(segment))
}

function findingKind(message) {
  const match = message.match(/\(([^)]+)\)|suppression \(([^)]+)\)/u)
  return match?.[1] ?? match?.[2] ?? "unknown"
}

export async function scanUnsafeTypeAssertions(root = ROOT) {
  const files = trackedFiles(root).filter(isScannablePath)
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        },
        plugins: { "maximal-model-policy": unsafeTypeAssertionsPlugin },
        rules: { [RULE_ID]: "warn" },
      },
    ],
  })
  const results = await eslint.lintFiles(files)
  const counts = new Map()
  for (const result of results) {
    const relativePath = path.relative(root, result.filePath)
    for (const message of result.messages) {
      if (message.ruleId !== RULE_ID) continue
      const kind = findingKind(message.message)
      const identity = `${relativePath}\0${kind}`
      const existing = counts.get(identity)
      counts.set(identity, {
        path: relativePath,
        kind,
        count: (existing?.count ?? 0) + 1,
      })
    }
  }
  return [...counts.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind),
  )
}

function identity(finding) {
  return `${finding.path}\0${finding.kind}\0${String(finding.count)}`
}

function categoryIdentity(finding) {
  return `${finding.path}\0${finding.kind}`
}

export function ratchetChanges(current, recorded) {
  const currentIds = new Set(current.map(identity))
  const recordedIds = new Set(recorded.map(identity))
  return {
    added: current.filter((finding) => !recordedIds.has(identity(finding))),
    gone: recorded.filter((finding) => !currentIds.has(identity(finding))),
  }
}

export function ratchetIncreases(current, recorded) {
  const recordedCounts = new Map(
    recorded.map((finding) => [categoryIdentity(finding), finding.count]),
  )
  return current.filter(
    (finding) =>
      finding.count
      > (recordedCounts.get(categoryIdentity(finding)) ?? 0),
  )
}

function readBaseline(filePath = BASELINE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeBaseline(findings, filePath = BASELINE_PATH) {
  fs.writeFileSync(filePath, `${JSON.stringify(findings, null, 2)}\n`)
}

function format(finding) {
  return `${finding.path}: ${finding.kind} (${String(finding.count)} occurrence${finding.count === 1 ? "" : "s"})`
}

export async function main(arguments_ = process.argv.slice(2)) {
  const list = arguments_.includes("--list")
  const initialize = arguments_.includes("--initialize")
  const update = arguments_.includes("--update")
  if (
    arguments_.some(
      (argument) => !["--initialize", "--list", "--update"].includes(argument),
    )
    || Number(list) + Number(initialize) + Number(update) > 1
  ) {
    throw new Error(
      "Usage: check-unsafe-type-assertions.mjs [--list|--initialize|--update]",
    )
  }

  const current = await scanUnsafeTypeAssertions()
  if (list) {
    process.stdout.write(`${JSON.stringify(current, null, 2)}\n`)
    return
  }

  const recorded = readBaseline()
  const { added, gone } = ratchetChanges(current, recorded)
  if (initialize) {
    if (recorded.length > 0) {
      throw new Error("The unsafe assertion baseline is already initialized.")
    }
    writeBaseline(current)
    process.stdout.write(
      `\u2714 initialized ${String(current.length)} unsafe assertion identities.\n`,
    )
    return
  }
  if (update) {
    if (ratchetIncreases(current, recorded).length > 0) {
      throw new Error(
        "The down-only unsafe assertion ratchet refuses new or increased identities.",
      )
    }
    writeBaseline(current)
    process.stdout.write(
      `\u2714 lowered the ratchet by ${String(gone.length)} unsafe assertion identities.\n`,
    )
    return
  }
  if (added.length === 0 && gone.length === 0) {
    process.stdout.write(
      `\u2714 ${String(current.length)} unsafe assertion identities match the ratchet.\n`,
    )
    return
  }
  if (added.length > 0) {
    process.stderr.write(
      `\u2716 ${String(added.length)} new or increased unsafe assertion identities:\n`,
    )
    for (const finding of added) {
      process.stderr.write(`  + ${format(finding)}\n`)
    }
  }
  if (gone.length > 0) {
    process.stderr.write(
      `\u2716 ${String(gone.length)} stale unsafe assertion identities; lower the ratchet:\n`,
    )
    for (const finding of gone) {
      process.stderr.write(`  - ${format(finding)}\n`)
    }
  }
  process.exitCode = 1
}

if (fileURLToPath(import.meta.url) === process.argv[1]) await main()
