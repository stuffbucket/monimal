import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath, URL } from "node:url"
import ts from "typescript"

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const workspaceRoot = path.resolve(packageRoot, "../..")
const config = readFileSync(path.join(packageRoot, "logging.toml"), "utf8")
const match = /^level = "(warn|error)"$/m.exec(config)
if (!match) throw new Error("logging.toml must set level to warn or error")
const level = match[1]
const enforce = /^enforce = "([^"]+)"$/m.exec(config)?.[1]
let count = 0
let errors = 0

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!["__tests__", "dist", "node_modules", "tests"].includes(entry.name))
        scan(location)
    } else if (
      entry.isFile()
      && /\.(?:tsx?|mjs|mts|js)$/.test(entry.name)
      && !/\.test\.[^.]+$/.test(entry.name)
    ) {
      if (
        location
        === path.join(
          workspaceRoot,
          "packages/maximal-core/src/lib/platform/logger.ts",
        )
      )
        continue
      const text = readFileSync(location, "utf8")
      const source = ts.createSourceFile(
        location,
        text,
        ts.ScriptTarget.Latest,
        true,
      )
      function visit(node) {
        const legacyConsole =
          ts.isCallExpression(node)
          && ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression)
          && ["consola", "console"].includes(node.expression.expression.text)
          && ["debug", "error", "info", "log", "trace", "warn"].includes(
            node.expression.name.text,
          )
        const legacyImport =
          ts.isImportDeclaration(node)
          && ts.isStringLiteral(node.moduleSpecifier)
          && node.moduleSpecifier.text === "consola"
        if (legacyConsole || legacyImport) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          )
          const relativePath = path
            .relative(workspaceRoot, location)
            .replaceAll(path.sep, "/")
          const severity =
            (
              level === "error"
              || (enforce && relativePath.startsWith(`${enforce}/`))
            ) ?
              "error"
            : "warn"
          process.stderr.write(
            `${relativePath}:${line + 1}: ${severity}: migrate runtime logging to @stuffbucket/maximal-logging\n`,
          )
          count++
          if (severity === "error") errors++
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
}

for (const relative of [
  "packages/maximal-core/src/lib",
  "packages/maximal-core/src/routes",
  "packages/maximal-core/src/services",
  "packages/maximal/client/src/main",
]) {
  scan(path.join(workspaceRoot, relative))
}
process.stderr.write(`Logging migration: ${count} alternatives (${level})\n`)
if (errors) process.exitCode = 1
if (count === 0 && level === "warn") {
  process.stderr.write(
    'Logging migration is clean: set logging.toml level to "error"\n',
  )
  process.exitCode = 1
}
