import { expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

import { getClaudeCodeSettingsPath } from "~/apps/claude-code/config"

test("writes the resolved Claude settings path", () => {
  const settingsPath = getClaudeCodeSettingsPath()
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, "unsafe-probe-write")
  expect(fs.existsSync(settingsPath)).toBe(true)
})
