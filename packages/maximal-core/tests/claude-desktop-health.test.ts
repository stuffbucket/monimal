/**
 * Health check for the Claude Desktop `ClientApp`: `getDetails().health`
 * should stay quiet while routing was never asked for, but flag it when the
 * durable intent (`config.apps.claudeDesktop.enabled`) says routing should be
 * on and the on-disk config library profile is missing or altered — e.g. the
 * user reset Claude Desktop's config, or something else touched it outside of
 * maximal. Mirrors `claude-code-cli-enable-persist.test.ts`'s health test for
 * Claude Code's analogous drift case.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { claudeDesktopApp } from "~/apps/claude-desktop"
import { writeConfig } from "~/lib/config/config"

import { redirectLocalAppData } from "./helpers/win-appdata"

let home: string
let restoreLocalAppData: () => void
const savedHome = process.env.HOME

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cd-health-"))
  process.env.HOME = home
  restoreLocalAppData = redirectLocalAppData(home)
  writeConfig({})
})

afterEach(() => {
  restoreLocalAppData()
  process.env.HOME = savedHome
  writeConfig({})
  try {
    fs.rmSync(home, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
})

describe("claudeDesktopApp.getDetails().health", () => {
  test("healthy when routing was never intended", async () => {
    expect((await claudeDesktopApp.getDetails()).health).toEqual({
      ok: true,
      issue: null,
    })
  })

  test("healthy right after enable()", async () => {
    await claudeDesktopApp.enable()
    writeConfig({ apps: { claudeDesktop: { enabled: true } } })

    expect((await claudeDesktopApp.getDetails()).health).toEqual({
      ok: true,
      issue: null,
    })
  })

  test("flags a missing profile when intent is on but the profile is gone", async () => {
    await claudeDesktopApp.enable()
    writeConfig({ apps: { claudeDesktop: { enabled: true } } })
    expect((await claudeDesktopApp.getDetails()).health.ok).toBe(true)

    // Simulate the user resetting Claude Desktop's own config outside of
    // maximal — remove exactly what enable() wrote.
    await claudeDesktopApp.disable()
    writeConfig({ apps: { claudeDesktop: { enabled: true } } })

    expect((await claudeDesktopApp.getDetails()).health).toEqual({
      ok: false,
      issue: "not-applied",
    })
  })
})
