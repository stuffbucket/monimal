import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const PERSISTENT_ACCOUNT_TESTS = [
  "auth-recovery.test.ts",
  "forward-error-auth-fatal.test.ts",
  "github-token-store.test.ts",
  "network-hysteresis.test.ts",
  "registry-needs-reauth.test.ts",
  "start-multi-account.test.ts",
  "start-run-server.test.ts",
]

const PLAUSIBLE_PERSISTED_IDENTITIES = [
  /login\s*:\s*["'](?:alice|bob|carol)["']/,
  /["'](?:alice|bob|carol)@github\.com["']/,
  /resolveLogin\s*:\s*\(\)\s*=>\s*Promise\.resolve\(["'](?:alice|bob|carol)["']\)/,
]

describe("persistent account fixture policy", () => {
  for (const relativePath of PERSISTENT_ACCOUNT_TESTS) {
    test(`${relativePath} cannot persist a plausible person`, () => {
      const source = fs.readFileSync(
        path.join(import.meta.dir, relativePath),
        "utf8",
      )
      for (const pattern of PLAUSIBLE_PERSISTED_IDENTITIES) {
        expect(source).not.toMatch(pattern)
      }
    })
  }
})
