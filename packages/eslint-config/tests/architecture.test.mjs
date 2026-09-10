import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"

import { ESLint } from "eslint"

import { architecture } from "../architecture.js"
import { typescript } from "../typescript.js"

const fixtureRoots = []

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

async function lintFixture({ from, source, targets = [], kind = "service" }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundaries-fixture-"))
  fixtureRoots.push(root)
  for (const target of targets) {
    const targetPath = path.join(root, target)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, "export const value = 1\n")
  }
  const fromPath = path.join(root, from)
  fs.mkdirSync(path.dirname(fromPath), { recursive: true })
  fs.writeFileSync(fromPath, source)

  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: architecture({ kind, root }),
  })
  const [result] = await eslint.lintFiles([fromPath])
  return result.messages
}

for (const fixture of [
  {
    name: "renderer cannot import main implementation",
    from: "src/renderer/view.js",
    source: 'import "../main/window.js"\n',
    targets: ["src/main/window.js"],
    ruleId: "boundaries/dependencies",
  },
  {
    name: "shared contracts cannot import renderer implementation",
    from: "src/shared/ipc.js",
    source: 'import "../renderer/view.js"\n',
    targets: ["src/renderer/view.js"],
    ruleId: "boundaries/dependencies",
  },
  {
    name: "production cannot import tests or fixtures",
    from: "src/service.js",
    source: 'import "../tests/fixture.js"\n',
    targets: ["tests/fixture.js"],
    ruleId: "boundaries/dependencies",
  },
  {
    name: "Electron public code cannot import client policy",
    from: "src/renderer/index.js",
    source: 'import "maximal-client"\n',
    kind: "electron",
    ruleId: "no-restricted-imports",
  },
  {
    name: "packages cannot import another package source tree",
    from: "src/index.js",
    source: 'import "@stuffbucket/maximal-electron/src/main/index.js"\n',
    ruleId: "no-restricted-imports",
  },
]) {
  test(fixture.name, async () => {
    const messages = await lintFixture(fixture)
    assert.ok(
      messages.some((message) => message.ruleId === fixture.ruleId),
      JSON.stringify(messages, null, 2),
    )
  })
}

test("client may import a declared Electron public entry point", async () => {
  const messages = await lintFixture({
    from: "src/renderer/view.js",
    source: 'import "stuffbucket-electron/renderer"\n',
    kind: "client",
  })
  assert.deepEqual(messages, [])
})

test("TypeScript lint rejects an entirely unused local binding", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unused-local-fixture-"))
  fixtureRoots.push(root)
  fs.mkdirSync(path.join(root, "src"))
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "esnext" }, include: ["src"] }),
  )
  const filePath = path.join(root, "src", "index.ts")
  fs.writeFileSync(filePath, "const entirelyUnused = 1\n")

  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: typescript({
      tsconfigRootDir: root,
      typeChecked: false,
    }),
  })
  const [result] = await eslint.lintFiles([filePath])
  assert.ok(
    result.messages.some(
      (message) => message.ruleId === "@typescript-eslint/no-unused-vars",
    ),
    JSON.stringify(result.messages, null, 2),
  )
})