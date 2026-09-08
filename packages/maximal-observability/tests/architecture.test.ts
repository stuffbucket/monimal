import {
  failedPeerChecks,
  missingPeerChecks,
  peerRequirements,
} from "@stuffbucket/maximal-electron/verify/peers"
import {
  failedShellVariableChecks,
  shellVariableChecks,
  shellVariableContract,
  shellVariableEntries,
  shellVariablesIn,
} from "@stuffbucket/maximal-electron/verify/shell-variables"
import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, extname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const packageRoot = resolve(import.meta.dirname, "..")
const srcRoot = join(packageRoot, "src")

function sourceFiles(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [".css", ".ts", ".tsx"].includes(extname(path)) ? [path] : []
  })
}

function manifestAt(path: string): {
  exports?: unknown
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} {
  return JSON.parse(readFileSync(path, "utf8")) as {
    exports?: unknown
    peerDependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
}

describe("renderer architecture", () => {
  it("uses only durable renderer seams and no host globals", () => {
    const sources = sourceFiles(srcRoot).map((file) => ({
      file,
      text: readFileSync(file, "utf8"),
    }))
    expect(sources.length).toBeGreaterThan(0)
    const forbidden = [
      /@stuffbucket\/maximal-core/u,
      /@stuffbucket\/maximal[/"']/u,
      /from\s+["']electron["']/u,
      /window\.maximal/u,
      /maximal-electron\/src\//u,
      /\bShellLayout\b/u,
      /className=["'](?:sb-shell|btn|chip|input|inspector|field)\b/u,
      /(?:^|\})\s*\.(?:sb-shell|btn|chip|input|inspector|field)\b/mu,
    ]
    for (const { file, text } of sources) {
      for (const pattern of forbidden)
        expect(pattern.test(text), `${file} matched ${String(pattern)}`).toBe(
          false,
        )
    }
    const rendererImports = sources.flatMap(({ text }) =>
      [
        ...text.matchAll(
          /from\s+["'](@stuffbucket\/maximal-electron[^"']*)["']/gu,
        ),
      ].map((match) => match[1]),
    )
    expect(rendererImports.length).toBeGreaterThan(0)
    expect(new Set(rendererImports)).toEqual(
      new Set(["@stuffbucket/maximal-electron/renderer"]),
    )
  })

  it("declares React and maximal-electron as mirrored peers", () => {
    const manifest = manifestAt(join(packageRoot, "package.json"))
    expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual([
      "@stuffbucket/maximal-electron",
      "react",
    ])
    for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
      expect(
        manifest.devDependencies?.[peer],
        `${peer} must be available for package development`,
      ).toBeDefined()
    }
  })

  it("satisfies maximal-electron published peer requirements", async () => {
    const verificationPath =
      require.resolve("@stuffbucket/maximal-electron/verify/peers")
    const electronRoot = dirname(dirname(verificationPath))
    const manifest = manifestAt(join(electronRoot, "package.json"))
    const requirements = await peerRequirements(electronRoot, manifest.exports)
    const checks = missingPeerChecks({
      requirements,
      subpaths: ["./renderer"],
      resolve: (specifier) => {
        try {
          require.resolve(specifier)
          return true
        } catch {
          return false
        }
      },
    })
    expect(checks.length).toBeGreaterThan(1)
    expect(failedPeerChecks(checks)).toEqual([])
  })

  it("uses only shell variables published by maximal-electron", () => {
    const upstreamCss = readFileSync(
      require.resolve("@stuffbucket/maximal-electron/renderer/styles.css"),
      "utf8",
    )
    const stylesheets = [
      { name: "maximal-electron styles.css", css: upstreamCss },
    ]
    const published = shellVariableEntries({
      stylesheets,
      runtimeProperties: [],
    })
    const checks = shellVariableChecks({
      stylesheets,
      runtimeProperties: [],
      published,
    })
    expect(checks.length).toBeGreaterThan(0)
    expect(failedShellVariableChecks(checks)).toEqual([])

    const contract = shellVariableContract({
      stylesheets,
      runtimeProperties: [],
    })
    const known = new Set([
      ...contract.required,
      ...contract.fallback,
      ...contract.structural,
    ])
    const ownCss = readFileSync(join(srcRoot, "styles.css"), "utf8")
    const own = shellVariablesIn(ownCss)
    const used = [...new Set([...own.required, ...own.fallback])]
    expect(used.length).toBeGreaterThan(0)
    expect(used.filter((variable) => !known.has(variable))).toEqual([])
    expect(ownCss).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu)
  })
})
