import { readFileSync, readdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const packageRoot = resolve(import.meta.dirname, "..")
const srcRoot = join(packageRoot, "src")

function sourceFiles(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [".css", ".ts", ".tsx"].includes(extname(path)) ? [path] : []
  })
}

describe("renderer architecture", () => {
  it("depends on maximal-design-system without maximal-electron", () => {
    const manifest = readFileSync(join(packageRoot, "package.json"), "utf8")
    expect(manifest).toContain('"@maximal/maximal-design-system"')
    expect(manifest).not.toContain('"@maximal/maximal-electron"')
  })

  it("uses only durable renderer seams and no host globals", () => {
    const sources = sourceFiles(srcRoot).map((file) => ({
      file,
      text: readFileSync(file, "utf8"),
    }))
    expect(sources.length).toBeGreaterThan(0)
    const forbidden = [
      /@maximal\/maximal-core/u,
      /@maximal\/maximal[/"']/u,
      /from\s+["']electron["']/u,
      /window\.maximal/u,
      /@maximal\/maximal-electron/u,
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
    const designSystemImports = sources.flatMap(({ text }) =>
      [
        ...text.matchAll(
          /from\s+["'](@maximal\/maximal-design-system[^"']*)["']/gu,
        ),
      ].map((match) => match[1]),
    )
    expect(designSystemImports.length).toBeGreaterThan(0)
    expect(new Set(designSystemImports)).toEqual(
      new Set(["@maximal/maximal-design-system"]),
    )
  })

  it("loads design-system CSS without maximal-electron variables", () => {
    const ownCss = readFileSync(join(srcRoot, "styles.css"), "utf8")
    expect(ownCss).toContain(
      '@import "@maximal/maximal-design-system/tokens.css";',
    )
    expect(ownCss).toContain(
      '@import "@maximal/maximal-design-system/styles.css";',
    )
    expect(ownCss).not.toMatch(/maximal-electron|sb-shell/u)
    expect(ownCss).not.toContain("--shell-")
    expect(ownCss).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu)
  })
})
