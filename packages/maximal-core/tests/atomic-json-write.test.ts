/**
 * Regression tests for the consolidated atomic JSON writer (#231). Proves the
 * shared helper — used by BOTH app config writers, Claude Code
 * (`writeClaudeCodeSettings`) and Claude Desktop (`applyConfigLibraryProfile`)
 * — is BOTH symlink-safe AND crash-recoverable.
 *
 * Every attempt now uses a writer-unique O_EXCL temporary file. A writer never
 * clears a shared temp name, because that entry could belong to another live
 * writer. Legacy fixed-name temps are harmless and remain untouched. Tests also
 * cover owner-only creation and mode preservation across replacement.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { writeClaudeCodeSettings } from "~/apps/claude-code/config"
import {
  applyConfigLibraryProfile,
  getClaude3pDir,
} from "~/apps/claude-desktop/config"
import { atomicWriteJson } from "~/lib/platform/atomic-json"

import { expectOwnerOnlyFile } from "./helpers/file-modes"
import { redirectLocalAppData } from "./helpers/win-appdata"

let dir: string
let restoreLocalAppData: () => void

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-atomic-json-"))
  // The Claude Desktop cases below resolve %LOCALAPPDATA% on win32 rather than
  // the `dir` they are handed; without this they would write to the real one.
  restoreLocalAppData = redirectLocalAppData(dir)
})

afterEach(() => {
  restoreLocalAppData()
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

describe("atomicWriteJson (shared helper)", () => {
  it("writes pretty JSON with a trailing newline, mode 0600, no .tmp leak", () => {
    const file = path.join(dir, "out.json")
    atomicWriteJson(file, { a: 1, b: ["x"] })
    const raw = fs.readFileSync(file, "utf8")
    expect(raw).toBe(`${JSON.stringify({ a: 1, b: ["x"] }, null, 2)}\n`)
    expect(raw.endsWith("\n")).toBe(true)
    expectOwnerOnlyFile(file)
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })

  it("creates missing parent directories", () => {
    const file = path.join(dir, "nested", "deep", "out.json")
    atomicWriteJson(file, { ok: true })
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ ok: true })
  })

  it("ignores a stale legacy temp instead of unlinking another writer's file", () => {
    const file = path.join(dir, "out.json")
    const legacyTemporaryFile = `${file}.tmp`
    fs.writeFileSync(legacyTemporaryFile, "possibly owned by another writer")

    atomicWriteJson(file, { a: 1 })

    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ a: 1 })
    expectOwnerOnlyFile(file)
    expect(fs.readFileSync(legacyTemporaryFile, "utf8")).toBe(
      "possibly owned by another writer",
    )
  })

  it("does not follow or unlink a legacy symlink temp", () => {
    const file = path.join(dir, "out.json")
    const victim = path.join(dir, "victim.txt")
    fs.writeFileSync(victim, "precious")
    fs.symlinkSync(victim, `${file}.tmp`)

    atomicWriteJson(file, { a: 1 })

    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ a: 1 })
    expect(fs.readFileSync(victim, "utf8")).toBe("precious")
    expect(fs.lstatSync(`${file}.tmp`).isSymbolicLink()).toBe(true)
  })

  it("preserves an existing regular file's mode", () => {
    if (process.platform === "win32") return
    const file = path.join(dir, "out.json")
    fs.writeFileSync(file, "{}\n", { mode: 0o640 })

    atomicWriteJson(file, { a: 1 })

    expect(fs.statSync(file).mode & 0o777).toBe(0o640)
  })
})

describe("writeClaudeCodeSettings — atomic write (#231)", () => {
  it("happy path: writes settings with mode 0600 and correct content", () => {
    const file = path.join(dir, "settings.json")
    writeClaudeCodeSettings(file, { foo: "bar" })
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ foo: "bar" })
    expectOwnerOnlyFile(file)
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })

  it("ignores a stale legacy <file>.tmp", () => {
    const file = path.join(dir, "settings.json")
    fs.writeFileSync(`${file}.tmp`, "stale")
    writeClaudeCodeSettings(file, { foo: "bar" })
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ foo: "bar" })
    expect(fs.existsSync(`${file}.tmp`)).toBe(true)
  })

  it("ignores a planted legacy symlink temp without clobbering its target", () => {
    const file = path.join(dir, "settings.json")
    const victim = path.join(dir, "victim.txt")
    fs.writeFileSync(victim, "precious")
    fs.symlinkSync(victim, `${file}.tmp`)
    writeClaudeCodeSettings(file, { foo: "bar" })
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ foo: "bar" })
    expect(fs.readFileSync(victim, "utf8")).toBe("precious")
  })
})

describe("Claude Desktop config writer — atomic write (#231)", () => {
  it("happy path: applies the profile and writes 0600 files", () => {
    const result = applyConfigLibraryProfile(dir)
    expect(result.wrote).toBe(true)
    const topPath = path.join(getClaude3pDir(dir), "claude_desktop_config.json")
    expect(fs.existsSync(topPath)).toBe(true)
    expectOwnerOnlyFile(topPath)
  })

  it("ignores a stale legacy _meta.json.tmp", () => {
    const libDir = path.join(getClaude3pDir(dir), "configLibrary")
    fs.mkdirSync(libDir, { recursive: true })
    fs.writeFileSync(path.join(libDir, "_meta.json.tmp"), "stale")
    const result = applyConfigLibraryProfile(dir)
    expect(result.wrote).toBe(true)
    const raw = fs.readFileSync(path.join(libDir, "_meta.json"), "utf8")
    const meta = JSON.parse(raw) as Record<string, unknown>
    expect(meta.appliedId).toBe(result.profileId)
    expect(fs.readFileSync(path.join(libDir, "_meta.json.tmp"), "utf8")).toBe(
      "stale",
    )
  })

  it("clears a planted symlink at a profile temp without clobbering its target", () => {
    const libDir = path.join(getClaude3pDir(dir), "configLibrary")
    fs.mkdirSync(libDir, { recursive: true })
    const victim = path.join(dir, "victim.txt")
    fs.writeFileSync(victim, "precious")
    fs.symlinkSync(victim, path.join(libDir, "_meta.json.tmp"))
    const result = applyConfigLibraryProfile(dir)
    expect(result.wrote).toBe(true)
    expect(fs.readFileSync(victim, "utf8")).toBe("precious")
    const raw = fs.readFileSync(path.join(libDir, "_meta.json"), "utf8")
    const meta = JSON.parse(raw) as Record<string, unknown>
    expect(meta.appliedId).toBe(result.profileId)
  })
})
