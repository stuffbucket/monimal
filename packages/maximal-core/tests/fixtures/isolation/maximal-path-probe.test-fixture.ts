import { expect, test } from "bun:test"
import fs from "node:fs"

import { PATHS } from "~/lib/platform/paths"

test("writes the resolved account path", () => {
  fs.mkdirSync(PATHS.APP_DIR, { recursive: true })
  fs.writeFileSync(PATHS.ACCOUNTS_PATH, "unsafe-probe-write")
  expect(fs.existsSync(PATHS.ACCOUNTS_PATH)).toBe(true)
})
