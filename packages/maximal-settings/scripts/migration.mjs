import assert from "node:assert/strict"
import { globSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import ts from "typescript"
import { z } from "zod"

const defaultPatterns = [
  "packages/*/src/**/*.{ts,tsx,js,mjs,cjs}",
  "packages/maximal/client/src/**/*.{ts,tsx,js,mjs,cjs}",
]
// Log placement reads OS state directories, not application settings.
const loggingPathReaders = new Set([
  "packages/maximal-logging/src/index.ts::environment:LOCALAPPDATA",
  "packages/maximal-logging/src/index.ts::environment:XDG_STATE_HOME",
])
const baselineSchema = z.object({
  version: z.literal(1),
  patterns: z.array(z.string()).nonempty(),
  entries: z.record(z.string(), z.number().int().positive()),
})

function member(node) {
  if (ts.isPropertyAccessExpression(node))
    return { object: node.expression, name: node.name.text }
  if (ts.isElementAccessExpression(node))
    return {
      object: node.expression,
      name:
        ts.isStringLiteralLike(node.argumentExpression) ?
          node.argumentExpression.text
        : "*",
    }
  return undefined
}

function importsEnvironment(node) {
  if (
    !ts.isImportDeclaration(node)
    || !ts.isStringLiteral(node.moduleSpecifier)
    || !["node:process", "process"].includes(node.moduleSpecifier.text)
  )
    return false
  const bindings = node.importClause?.namedBindings
  return Boolean(
    bindings
    && ts.isNamedImports(bindings)
    && bindings.elements.some(
      (binding) => (binding.propertyName ?? binding.name).text === "env",
    ),
  )
}

function readerKind(node, processNames) {
  const access = member(node)
  if (
    access
    && ts.isIdentifier(access.object)
    && processNames.has(access.object.text)
    && ["*", "env"].includes(access.name)
  ) {
    const parent = member(node.parent)
    return `environment:${parent?.object === node ? parent.name : "*"}`
  }
  if (importsEnvironment(node)) return "environment:*"
  if (
    ts.isVariableDeclaration(node)
    && node.initializer
    && ts.isIdentifier(node.initializer)
    && processNames.has(node.initializer.text)
    && ts.isObjectBindingPattern(node.name)
    && node.name.elements.some(
      (binding) => (binding.propertyName ?? binding.name).getText() === "env",
    )
  )
    return "environment:*"
  if (
    ts.isStringLiteralLike(node)
    && /(?:^|[/\\.])(?:settings|preferences|config)\.json$/.test(node.text)
  )
    return "settings-file"
  return undefined
}

export function scanSettingsReaders({ root, patterns = defaultPatterns }) {
  const files = [...new Set(globSync(patterns, { cwd: root }))].filter(
    (file) =>
      !/(?:^|[/\\])(?:tests?|node_modules|dist)[/\\]|\.(?:test|spec|d)\.tsx?$/.test(
        file,
      ),
  )
  assert.ok(files.length, "Settings migration scope matched no runtime files")
  const entries = {}
  const exempted = new Set()
  for (const file of files.sort()) {
    const source = ts.createSourceFile(
      file,
      readFileSync(resolve(root, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    )
    const processNames = new Set(["process"])
    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement)
        && ts.isStringLiteral(statement.moduleSpecifier)
        && ["node:process", "process"].includes(statement.moduleSpecifier.text)
      ) {
        if (statement.importClause?.name)
          processNames.add(statement.importClause.name.text)
        const bindings = statement.importClause?.namedBindings
        if (bindings && ts.isNamespaceImport(bindings))
          processNames.add(bindings.name.text)
      }
    }
    const visit = (node) => {
      const kind = readerKind(node, processNames)
      if (kind) {
        const key = `${file.split(sep).join("/")}::${kind}`
        if (loggingPathReaders.has(key) && !exempted.has(key)) exempted.add(key)
        else entries[key] = (entries[key] ?? 0) + 1
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

export function compareSettingsReaders(current, approved) {
  const added = Object.keys(current)
    .filter((key) => current[key] > (approved[key] ?? 0))
    .sort()
  const removed = Object.keys(approved)
    .filter((key) => (current[key] ?? 0) < approved[key])
    .sort()
  return { added, removed }
}

function main() {
  const { values } = parseArgs({
    options: {
      root: {
        type: "string",
        default: fileURLToPath(new URL("../../../", import.meta.url)),
      },
      baseline: {
        type: "string",
        default: fileURLToPath(
          new URL("../migration-baseline.json", import.meta.url),
        ),
      },
      update: { type: "boolean" },
      initialize: { type: "boolean" },
    },
  })
  assert.ok(
    !values.update || !values.initialize,
    "Choose one baseline operation",
  )
  if (values.initialize)
    assert.equal(
      existsSync(values.baseline),
      false,
      "Migration baseline already exists",
    )
  const baseline =
    values.initialize ?
      { version: 1, patterns: defaultPatterns, entries: {} }
    : baselineSchema.parse(JSON.parse(readFileSync(values.baseline, "utf8")))
  const current = scanSettingsReaders({
    root: values.root,
    patterns: baseline.patterns,
  })
  const changes = compareSettingsReaders(current, baseline.entries)
  if (!values.initialize)
    assert.deepEqual(
      changes.added,
      [],
      "New settings readers are forbidden; use the settings package",
    )
  if (values.update || values.initialize)
    writeFileSync(
      values.baseline,
      JSON.stringify({ ...baseline, entries: current }, null, 2) + "\n",
      { flag: values.initialize ? "wx" : "w" },
    )
  else
    assert.deepEqual(
      changes.removed,
      [],
      "Settings readers were removed; run migration:update to lower the baseline",
    )
  console.log(
    `Settings migration: ${Object.keys(current).length} remaining reader identities (${relative(values.root, values.baseline)})`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
