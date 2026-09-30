/**
 * Boot-time integration for the multi-account registry (slice 3). Unit tests
 * cover the pure registry ops + migration in isolation; these spawn the real
 * `start` subprocess against a fresh MAXIMAL_HOME so the actual boot wiring
 * is exercised — the part no in-process test can reach cleanly because PATHS is
 * captured at import time.
 *
 * Three release-critical paths:
 *   1. A legacy single-record token on disk is migrated into accounts.json on
 *      first boot (so users who signed in before multi-account keep working).
 *   2. A registry with NO active account (e.g. after signing out of the active
 *      one while others remain) boots cleanly to unauthenticated — not a
 *      dead-end or a crash.
 *   3. A persisted active OAuth account is restored after a full process stop
 *      and restart without mutating its registry record.
 *
 * Ports are ephemeral and read back off the ready-line — see
 * `tests/helpers/spawn-engine.ts` for why guessing one was flaky.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  addAndActivate,
  emptyRegistry,
  makeAccountRecord,
  readRegistry,
  writeRegistry,
} from "~/lib/auth/github-token-store"
import { GITHUB_API_BASE_OVERRIDE_IPV4_HOSTNAME } from "~/lib/config/api-config"

import type { Engine } from "./helpers/spawn-engine"

import { startEngine } from "./helpers/spawn-engine"

const TEST_LEGACY_TOKEN = "gho_maximal_test_only_legacy_noncredential"
const TEST_RESTART_TOKEN = "gho_maximal_test_only_restart_noncredential"
const TEST_RESTART_LOGIN = "maximal-test-only-restart"
const TEST_RESTART_KEY = `${TEST_RESTART_LOGIN}@github.com`
const TEST_INACTIVE_HOST = "github.example.invalid"
const TEST_INACTIVE_LOGIN = "maximal-test-only-bob"
const TEST_INACTIVE_KEY = `${TEST_INACTIVE_LOGIN}@${TEST_INACTIVE_HOST}`

describe("boot migrates a legacy token into the registry", () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-migrate-"))
  let engine: Engine

  beforeAll(async () => {
    // Seed a legacy single-record token. A `gho_` token is used directly as a
    // Copilot bearer (no /v2/token mint), so boot's Copilot bootstrap fails
    // NON-fatally (a plain 401 from /user or /models, not a
    // CopilotAuthFatalError) — it degrades and KEEPS the on-disk record rather
    // than wiping it, leaving the migrated registry observable.
    fs.writeFileSync(path.join(tmpHome, "github_token"), TEST_LEGACY_TOKEN)
    engine = await startEngine({ home: tmpHome, args: ["--verbose"] })
  })

  afterAll(async () => {
    await engine.stop()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  test("writes accounts.json with a migration-tagged active account", () => {
    const registryPath = path.join(tmpHome, "accounts.json")
    expect(fs.existsSync(registryPath)).toBe(true)
    const reg = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      schemaVersion: number
      activeKey: string | null
      accounts: Record<
        string,
        { token: string; addedVia: string; host: string }
      >
    }
    expect(reg.schemaVersion).toBe(2)
    const entries = Object.values(reg.accounts)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.addedVia).toBe("migration")
    expect(entries[0]?.token).toBe(TEST_LEGACY_TOKEN)
    // login lookup fails with a garbage token → keyed unknown@github.com, and
    // that key is active.
    expect(reg.activeKey).toBe("unknown@github.com")
  })

  test("server still binds (boot is not blocked by the bad token)", async () => {
    const res = await fetch(`${engine.proxyUrl}/`)
    expect(res.status).toBe(200)
  })
})

describe("boot with a registry that has no active account", () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-noactive-"))
  let engine: Engine

  beforeAll(async () => {
    // Registry with one INACTIVE account and activeKey: null — the state after
    // signing out of the active account while another remembered account stays.
    // Migration must NOT run (registry already populated), and boot must land
    // unauthenticated rather than dead-end or crash.
    fs.writeFileSync(
      path.join(tmpHome, "accounts.json"),
      JSON.stringify({
        schemaVersion: 2,
        activeKey: null,
        accounts: {
          [TEST_INACTIVE_KEY]: {
            login: TEST_INACTIVE_LOGIN,
            host: TEST_INACTIVE_HOST,
            token: "gho_maximal_test_only_bob_noncredential",
            tokenType: "gho_",
            addedVia: "gh-cli",
            obtainedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    )
    engine = await startEngine({ home: tmpHome, args: ["--verbose"] })
  })

  afterAll(async () => {
    await engine.stop()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  test("binds and reports unauthenticated (no active token loaded)", async () => {
    // The control listener, not the public one — /_debug moved there (#10).
    const res = await fetch(`${engine.controlUrl}/_debug/state`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      runtime: { github_token_present: boolean }
    }
    expect(body.runtime.github_token_present).toBe(false)
  })

  test("the remembered account is left intact in the registry", () => {
    const raw = fs.readFileSync(path.join(tmpHome, "accounts.json"), "utf8")
    const reg = JSON.parse(raw) as {
      activeKey: string | null
      accounts: Record<string, unknown>
    }
    expect(reg.activeKey).toBeNull()
    expect(TEST_INACTIVE_KEY in reg.accounts).toBe(true)
  })
})

describe("boot restores an active OAuth account across process restarts", () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "maximal-restart-"))
  const requests: Array<{ path: string; authorization: string | null }> = []
  const fixture = Bun.serve({
    port: 0,
    hostname: GITHUB_API_BASE_OVERRIDE_IPV4_HOSTNAME,
    fetch(request) {
      const { pathname } = new URL(request.url)
      requests.push({
        path: pathname,
        authorization: request.headers.get("authorization"),
      })
      if (pathname === "/user") {
        return Response.json({ login: TEST_RESTART_LOGIN })
      }
      return new Response("not found", { status: 404 })
    },
  })

  async function seedActiveAccount(): Promise<void> {
    await writeRegistry(
      path.join(tmpHome, "accounts.json"),
      addAndActivate(
        emptyRegistry(),
        makeAccountRecord({
          login: TEST_RESTART_LOGIN,
          host: "github.com",
          token: TEST_RESTART_TOKEN,
          addedVia: "device-code",
        }),
      ),
    )
  }

  afterAll(async () => {
    await fixture.stop(true)
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  async function startAndAssertCredentialRestored(): Promise<void> {
    const currentEngine = await startEngine({
      home: tmpHome,
      args: ["--verbose"],
      env: {
        NODE_ENV: "test",
        GITHUB_API_BASE: fixture.url.origin,
      },
    })

    try {
      let tokenStatus:
        | { github_token_present: boolean; copilot_token_present: boolean }
        | undefined
      const deadline = Date.now() + 5_000
      do {
        const response = await fetch(`${currentEngine.controlUrl}/_debug/state`)
        expect(response.status).toBe(200)
        const body = (await response.json()) as {
          runtime: {
            github_token_present: boolean
            copilot_token_present: boolean
          }
        }
        tokenStatus = body.runtime
        if (
          tokenStatus.github_token_present
          && tokenStatus.copilot_token_present
        ) {
          break
        }
        await Bun.sleep(25)
      } while (Date.now() < deadline)

      expect(tokenStatus).toMatchObject({
        github_token_present: true,
        copilot_token_present: true,
      })
    } finally {
      await currentEngine.stop()
    }
  }

  test("restores the same active account after a full stop and second start", async () => {
    await seedActiveAccount()
    expect(
      (await readRegistry(path.join(tmpHome, "accounts.json"))).activeKey,
    ).toBe(TEST_RESTART_KEY)
    await startAndAssertCredentialRestored()
    await startAndAssertCredentialRestored()

    const authenticatedRequests = requests.filter(
      ({ path: requestPath }) => requestPath === "/user",
    )
    expect(
      authenticatedRequests.map(({ path: requestPath }) => requestPath),
    ).toEqual(["/user", "/user"])
    expect(
      authenticatedRequests.every(
        ({ authorization }) => authorization === `token ${TEST_RESTART_TOKEN}`,
      ),
    ).toBe(true)

    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpHome, "accounts.json"), "utf8"),
    ) as {
      activeKey: string | null
      accounts: Record<string, { token: string }>
    }
    expect(registry.activeKey).toBe(TEST_RESTART_KEY)
    expect(registry.accounts[TEST_RESTART_KEY].token).toBe(TEST_RESTART_TOKEN)
  }, 60_000)
})
