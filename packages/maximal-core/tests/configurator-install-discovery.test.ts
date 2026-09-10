import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const inContainer = process.env.MAXIMAL_TEST_CONTAINER === "1"
const containerDescribe = inContainer ? describe : describe.skip
const probePath = fileURLToPath(
  new URL("./helpers/configurator-install-probe.ts", import.meta.url),
)

function executable(filePath: string, output: string, exitCode = 0): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    `#!/bin/sh\nprintf '${output}\\n'\nexit ${exitCode}\n`,
    { mode: 0o755 },
  )
}

function snapshot(root: string): Array<string> {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .map((entry) => {
      const entryPath = path.join(entry.parentPath, entry.name)
      const relativePath = path.relative(root, entryPath)
      if (entry.isSymbolicLink()) {
        return `${relativePath}:link:${fs.readlinkSync(entryPath)}`
      }
      if (entry.isDirectory()) return `${relativePath}:directory`
      const stat = fs.statSync(entryPath)
      return `${relativePath}:file:${stat.mode & 0o777}:${fs.readFileSync(entryPath, "utf8")}`
    })
    .sort()
}

function detect(
  root: string,
  detector: "claude-code" | "claude-desktop" | "copilot-cli",
  environment: Record<string, string> = {},
): unknown {
  const home = path.join(root, "home")
  const before = snapshot(root)
  const output = execFileSync(process.execPath, [probePath, detector], {
    cwd: root,
    encoding: "utf8",
    env: {
      HOME: home,
      LOCALAPPDATA: path.join(home, "AppData", "Local"),
      PATH: "/usr/bin:/bin",
      ...environment,
    },
  })
  expect(snapshot(root)).toEqual(before)
  return JSON.parse(output) as unknown
}

containerDescribe("configurator installation discovery container", () => {
  test("discovers ambient command-line installations without host paths", () => {
    const root = fs.mkdtempSync(
      path.join(process.env.MAXIMAL_TEST_ROOT ?? os.tmpdir(), "discovery-"),
    )
    const home = path.join(root, "home")
    const pathBin = path.join(root, "path-bin")
    const localBin = path.join(home, ".local", "bin")
    const claudeLocal = path.join(home, ".claude", "local")
    const npmPrefix = path.join(root, "npm-prefix")
    const fakeTools = path.join(root, "fake-tools")
    try {
      expect(detect(root, "claude-code")).toEqual([])
      expect(detect(root, "copilot-cli")).toBe(false)

      executable(path.join(pathBin, "claude"), "Claude Code 1.2.3")
      expect(
        detect(root, "claude-code", { PATH: `${pathBin}:/usr/bin:/bin` }),
      ).toEqual([
        {
          path: path.join(pathBin, "claude"),
          resolvedPath: path.join(pathBin, "claude"),
          version: "1.2.3",
          source: "path",
        },
      ])
      fs.rmSync(pathBin, { recursive: true })

      executable(path.join(localBin, "claude"), "2.3.4")
      expect(detect(root, "claude-code")).toEqual([
        {
          path: path.join(localBin, "claude"),
          resolvedPath: path.join(localBin, "claude"),
          version: "2.3.4",
          source: "local-bin",
        },
      ])
      fs.rmSync(localBin, { recursive: true })

      executable(path.join(claudeLocal, "claude"), "ignored", 7)
      expect(detect(root, "claude-code")).toEqual([
        {
          path: path.join(claudeLocal, "claude"),
          resolvedPath: path.join(claudeLocal, "claude"),
          version: null,
          source: "claude-local",
        },
      ])
      fs.rmSync(path.join(home, ".claude"), { recursive: true })

      executable(path.join(fakeTools, "npm"), npmPrefix)
      executable(path.join(npmPrefix, "bin", "claude"), "3.4.5")
      expect(
        detect(root, "claude-code", { PATH: `${fakeTools}:/usr/bin:/bin` }),
      ).toEqual([
        {
          path: path.join(npmPrefix, "bin", "claude"),
          resolvedPath: path.join(npmPrefix, "bin", "claude"),
          version: "3.4.5",
          source: "npm-global",
        },
      ])
      fs.rmSync(npmPrefix, { recursive: true })

      executable(path.join(localBin, "claude"), "# __MAXIMAL_CLAUDE_SHIM__")
      expect(detect(root, "claude-code")).toEqual([])
      fs.rmSync(localBin, { recursive: true })

      executable(path.join(localBin, "claude"), "4.5.6")
      fs.mkdirSync(pathBin, { recursive: true })
      fs.symlinkSync(
        path.join(localBin, "claude"),
        path.join(pathBin, "claude"),
      )
      expect(
        detect(root, "claude-code", { PATH: `${pathBin}:/usr/bin:/bin` }),
      ).toEqual([
        {
          path: path.join(pathBin, "claude"),
          resolvedPath: path.join(localBin, "claude"),
          version: "4.5.6",
          source: "local-bin",
        },
      ])
      fs.rmSync(pathBin, { recursive: true })
      fs.rmSync(localBin, { recursive: true })

      const legacyTarget = path.join(root, "legacy", "claude")
      executable(legacyTarget, "# __MAXIMAL_CLAUDE_SHIM__")
      fs.mkdirSync(pathBin, { recursive: true })
      fs.symlinkSync(legacyTarget, path.join(pathBin, "claude"))
      expect(
        detect(root, "claude-code", { PATH: `${pathBin}:/usr/bin:/bin` }),
      ).toEqual([])
      fs.rmSync(pathBin, { recursive: true })

      const homebrewClaude = "/opt/homebrew/bin/claude"
      executable(homebrewClaude, "5.6.7")
      expect(detect(root, "claude-code")).toEqual([
        {
          path: homebrewClaude,
          resolvedPath: homebrewClaude,
          version: "5.6.7",
          source: "homebrew",
        },
      ])
      fs.rmSync(homebrewClaude)

      executable(path.join(pathBin, "copilot"), "copilot")
      expect(
        detect(root, "copilot-cli", { PATH: `${pathBin}:/usr/bin:/bin` }),
      ).toBe(true)
      fs.rmSync(pathBin, { recursive: true })
      fs.mkdirSync(path.join(pathBin, "copilot"), { recursive: true })
      expect(
        detect(root, "copilot-cli", { PATH: `${pathBin}:/usr/bin:/bin` }),
      ).toBe(false)
      fs.rmSync(pathBin, { recursive: true })
      executable(path.join(pathBin, "copilot.cmd"), "copilot")
      expect(
        detect(root, "copilot-cli", {
          MAXIMAL_CONFIGURATOR_TEST_PLATFORM: "win32",
          PATH: `${pathBin}:/usr/bin:/bin`,
        }),
      ).toBe(true)
    } finally {
      fs.rmSync("/opt/homebrew/bin/claude", { force: true })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test("discovers desktop installations through isolated platform fixtures", () => {
    const root = fs.mkdtempSync(
      path.join(process.env.MAXIMAL_TEST_ROOT ?? os.tmpdir(), "discovery-"),
    )
    const environment = { MAXIMAL_CONFIGURATOR_TEST_PLATFORM: "darwin" }
    try {
      expect(detect(root, "claude-desktop", environment)).toBe(false)
      fs.mkdirSync("/Applications/Claude.app", { recursive: true })
      expect(detect(root, "claude-desktop", environment)).toBe(true)
      fs.rmSync("/Applications/Claude.app", { recursive: true })

      const localAppData = path.join(root, "home", "AppData", "Local")
      const windows = { MAXIMAL_CONFIGURATOR_TEST_PLATFORM: "win32" }
      expect(detect(root, "claude-desktop", windows)).toBe(false)

      const directInstall = path.join(localAppData, "AnthropicClaude")
      fs.mkdirSync(directInstall, { recursive: true })
      expect(detect(root, "claude-desktop", windows)).toBe(true)
      fs.rmSync(directInstall, { recursive: true })

      const storeLauncher = path.join(
        localAppData,
        "Microsoft",
        "WindowsApps",
        "Claude.exe",
      )
      fs.mkdirSync(path.dirname(storeLauncher), { recursive: true })
      fs.writeFileSync(storeLauncher, "fixture")
      expect(detect(root, "claude-desktop", windows)).toBe(true)
      fs.rmSync(storeLauncher)

      const exactPackage = path.join(
        localAppData,
        "Packages",
        "Claude_pzs8sxrjxfjjc",
      )
      fs.mkdirSync(exactPackage, { recursive: true })
      expect(detect(root, "claude-desktop", windows)).toBe(true)
      fs.rmSync(exactPackage, { recursive: true })

      const unrelatedPackage = path.join(
        localAppData,
        "Packages",
        "Unrelated_fixture",
      )
      fs.mkdirSync(unrelatedPackage, { recursive: true })
      expect(detect(root, "claude-desktop", windows)).toBe(false)

      fs.mkdirSync(
        path.join(localAppData, "Packages", "AnthropicPBC.Claude_fixture"),
        { recursive: true },
      )
      expect(detect(root, "claude-desktop", windows)).toBe(true)
    } finally {
      fs.rmSync("/Applications/Claude.app", { recursive: true, force: true })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
