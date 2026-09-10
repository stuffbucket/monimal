import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

import {
  packageCycleEdges,
  packageRuleViolations,
  readArchitecturePolicy,
  readPackageGraph,
} from "../scripts/architecture-graph.mjs"
import { cycleEdges } from "../packages/maximal-core/scripts/analysis/cycles.ts"
import {
  crossFilePairs,
  duplicatePairId,
} from "../packages/maximal-core/scripts/analysis/duplicates.ts"
import { ratchetChanges } from "../packages/maximal-core/scripts/analysis/ratchet.ts"
import { pnpmWorkspacePaths } from "../scripts/workspace-packages.mjs"

const root = path.resolve(import.meta.dirname, "..")

test("package graph reports manifest cycles and layer violations with edges", () => {
  const graph = {
    edges: [
      { from: "public-shell", to: "private-client", kind: "dependencies" },
      { from: "private-client", to: "public-shell", kind: "devDependencies" },
      { from: "public-shell", to: "external-runtime", kind: "peerDependencies" },
    ],
  }
  const cycles = packageCycleEdges(graph)
  assert.deepEqual([...cycles.keys()].sort(), [
    "private-client -> public-shell",
    "public-shell -> private-client",
  ])
  assert.equal(cycles.get("public-shell -> private-client").kind, "dependencies")
  assert.deepEqual(
    packageRuleViolations(graph, {
      deny: [
        { from: ["public-shell"], to: ["private-client", "external-runtime"] },
      ],
      require: [{ from: "public-shell", to: ["contract"] }],
    }),
    [
      "forbidden public-shell -> private-client (dependencies)",
      "forbidden public-shell -> external-runtime (peerDependencies)",
      "required public-shell -> contract is missing",
    ],
  )
})

test("package graph retains external dependency edges as cycle leaves", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-packages-"))
  try {
    fs.mkdirSync(path.join(fixture, "pkg"))
    fs.writeFileSync(
      path.join(fixture, "pkg", "package.json"),
      JSON.stringify({
        name: "workspace-package",
        peerDependencies: { "external-runtime": "1.0.0" },
      }),
    )
    const graph = readPackageGraph(fixture, {
      packages: { "workspace-package": { root: "pkg" } },
    })
    assert.deepEqual(graph.edges, [
      {
        from: "workspace-package",
        to: "external-runtime",
        kind: "peerDependencies",
      },
    ])
    assert.deepEqual([...packageCycleEdges(graph)], [])
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("source cycles and clone pairs use stable edge and unordered identities", () => {
  const result = {
    modules: [
      {
        source: "src/a.ts",
        dependencies: [
          { resolved: "src/b.ts", circular: true, cycle: [{ name: "src/a.ts" }] },
        ],
      },
      {
        source: "src/b.ts",
        dependencies: [{ resolved: "src/a.ts", circular: true }],
      },
    ],
    summary: { violations: [], totalCruised: 2, totalDependenciesCruised: 2 },
  }
  assert.deepEqual([...cycleEdges(result).keys()].sort(), [
    "src/a.ts -> src/b.ts",
    "src/b.ts -> src/a.ts",
  ])
  assert.equal(duplicatePairId("src/z.ts", "src/a.ts"), "src/a.ts <-> src/z.ts")

  const report = {
    duplicates: [
      {
        firstFile: { name: path.join(root, "turbo.json"), start: 1, end: 8 },
        secondFile: { name: path.join(root, "package.json"), start: 20, end: 27 },
        lines: 8,
        tokens: 60,
      },
    ],
    statistics: {
      total: { clones: 1, duplicatedLines: 8, lines: 30, percentage: 26.67, sources: 2 },
    },
  }
  assert.deepEqual([...crossFilePairs(report, root).keys()], [
    "package.json <-> turbo.json",
  ])
})

test("ratchets reject additions and require recording removals", () => {
  assert.deepEqual(ratchetChanges(["known", "new"], ["known"]), {
    added: ["new"],
    gone: [],
  })
  assert.deepEqual(ratchetChanges([], ["fixed"]), {
    added: [],
    gone: ["fixed"],
  })
})

test("dependency-cruiser and jscpd detect source fixtures", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-tools-"))
  try {
    fs.mkdirSync(path.join(fixture, "src"))
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "fixture", private: true, type: "module" }),
    )
    fs.writeFileSync(
      path.join(fixture, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler" } }),
    )
    const cloneBody = `export function copied(input: string): string {
  const words = input.trim().split(/\\s+/)
  const normalized = words.map((word) => word.toLowerCase())
  const unique = [...new Set(normalized)]
  const ordered = unique.sort((left, right) => left.localeCompare(right))
  const joined = ordered.join("-")
  return joined.length > 10 ? joined.slice(0, 10) : joined.padEnd(10, "x")
}
`
    fs.writeFileSync(path.join(fixture, "src", "a.ts"), `import "./b.js"\n${cloneBody}`)
    fs.writeFileSync(path.join(fixture, "src", "b.ts"), `import "./a.js"\n${cloneBody}`)

    const cyclesUrl = pathToFileURL(
      path.join(root, "packages/maximal-core/scripts/analysis/cycles.ts"),
    ).href
    const duplicatesUrl = pathToFileURL(
      path.join(root, "packages/maximal-core/scripts/analysis/duplicates.ts"),
    ).href
    const cruiserConfig = path.join(
      root,
      "packages/maximal-core/dependency-cruiser-analysis.mjs",
    )
    const jscpdConfig = path.join(root, "packages/maximal-core/.jscpd.json")
    const script = `
      import { cruise, cycleEdges } from ${JSON.stringify(cyclesUrl)};
      import { detectDuplicates, crossFilePairs } from ${JSON.stringify(duplicatesUrl)};
      const root = ${JSON.stringify(fixture)};
      const [cruiseResult, duplicateResult] = await Promise.all([
        cruise({ root, paths: ["src"], config: ${JSON.stringify(cruiserConfig)} }),
        detectDuplicates({ root, paths: ["src"], config: ${JSON.stringify(jscpdConfig)} }),
      ]);
      console.log(JSON.stringify({
        cycles: [...cycleEdges(cruiseResult).keys()].sort(),
        pairs: [...crossFilePairs(duplicateResult, root).keys()].sort(),
      }));
    `
    const run = spawnSync("bun", ["--eval", script], {
      cwd: fixture,
      encoding: "utf8",
    })
    assert.equal(run.status, 0, run.stderr)
    const detected = JSON.parse(run.stdout.trim())
    assert.deepEqual(detected.cycles, [
      "src/a.ts -> src/b.ts",
      "src/b.ts -> src/a.ts",
    ])
    assert.deepEqual(detected.pairs, ["src/a.ts <-> src/b.ts"])
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("Knip permits public entry capability and rejects internal dead code", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-knip-"))
  try {
    fs.mkdirSync(path.join(fixture, "src"))
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "knip-fixture", private: true, type: "module" }),
    )
    fs.writeFileSync(
      path.join(fixture, "knip.json"),
      JSON.stringify({ entry: ["src/index.ts"], project: ["src/**/*.ts"] }),
    )
    fs.writeFileSync(
      path.join(fixture, "src", "index.ts"),
      'import { used } from "./internal"\nexport const publicCapability = used\n',
    )
    fs.writeFileSync(
      path.join(fixture, "src", "internal.ts"),
      "export const used = 1\nexport const deadInternalExport = 2\n",
    )
    fs.writeFileSync(
      path.join(fixture, "src", "orphan.ts"),
      "export const unreachable = true\n",
    )

    const knip = path.join(
      root,
      "packages/maximal-core/node_modules/knip/bin/knip-bun.js",
    )
    const run = spawnSync("bun", [knip], { cwd: fixture, encoding: "utf8" })
    const output = `${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 1, output)
    assert.match(output, /orphan\.ts/)
    assert.match(output, /deadInternalExport/)
    assert.doesNotMatch(output, /publicCapability/)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("every intended package is analyzed with tools pinned by one owner", () => {
  const policy = readArchitecturePolicy(root)
  const workspacePackageNames = pnpmWorkspacePaths(root)
    .filter((packageRoot) => packageRoot !== ".")
    .map((packageRoot) =>
      JSON.parse(fs.readFileSync(path.join(root, packageRoot, "package.json"), "utf8")).name,
    )
    .sort()
  assert.deepEqual(Object.keys(policy.packages).sort(), workspacePackageNames)
  for (const [name, options] of Object.entries(policy.packages)) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, options.root, "package.json"), "utf8"),
    )
    assert.equal(manifest.name, name)
    assert.match(manifest.scripts.analyze, /maximal-core\/scripts\/analyze\.ts|scripts\/analyze\.ts/)
  }

  const core = JSON.parse(
    fs.readFileSync(path.join(root, "packages/maximal-core/package.json"), "utf8"),
  )
  assert.deepEqual(
    Object.fromEntries(
      ["dependency-cruiser", "jscpd", "knip"].map((name) => [
        name,
        core.devDependencies[name],
      ]),
    ),
    { "dependency-cruiser": "18.2.0", jscpd: "5.1.1", knip: "6.34.0" },
  )
  const eslintConfig = JSON.parse(
    fs.readFileSync(path.join(root, "packages/eslint-config/package.json"), "utf8"),
  )
  assert.equal(eslintConfig.dependencies["eslint-plugin-boundaries"], "7.2.0")
  const workspaceVerifier = fs.readFileSync(
    path.join(root, "scripts/verify-workspace.mjs"),
    "utf8",
  )
  assert.match(workspaceVerifier, /readArchitecturePolicy\(ROOT\)/)
  assert.doesNotMatch(workspaceVerifier, /concreteProviders|dshRuntime/)
})