/**
 * Zero-click auto-recovery (src/lib/auth-recovery.ts). Drives the DI shim so
 * preflight / mint / model-refresh are observable without real network. The
 * registry is the real store, isolated to a temp COPILOT_API_HOME by the global
 * test preload (tests/test-setup.ts).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import {
  __resetAuthControllerForTests,
  __setAuthControllerDepsForTests,
  getAuthStatus,
  markAuthDegraded,
  markSignedIn,
  registerAutoRecovery,
} from "~/lib/auth/auth-controller"
import {
  __resetAuthRecoveryDepsForTests,
  __setAuthRecoveryDepsForTests,
  activateAccountLive,
  attemptAutoRecovery,
  setAccountEnabledLive,
} from "~/lib/auth/auth-recovery"
import {
  addAndActivate,
  emptyRegistry,
  markNeedsReauth,
  readDefaultRegistry,
  setAccountEnabled,
  writeDefaultRegistry,
} from "~/lib/auth/github-token-store"
import { CopilotAuthFatalError } from "~/lib/errors/error"
import { state } from "~/lib/runtime-state/state"

import {
  makeTestAccount,
  resetDefaultTestRegistry,
  testAccountKey,
  testAccountLogin,
  testAccountToken,
  type TestAccountName,
} from "./helpers/account-fixtures"

const rec = (name: TestAccountName) => makeTestAccount(name)
const key = (name: TestAccountName) => testAccountKey(name)
const login = (name: TestAccountName) => testAccountLogin(name)
const token = (name: TestAccountName) => testAccountToken(name)
const ERR = { status: 401 as number | null, message: "revoked", at: "t" }

const harness = {
  preflight: (_t: string, _l: string): Promise<string | null> =>
    Promise.resolve(null),
  setup: (): Promise<void> => Promise.resolve(),
  setupSawToken: undefined as string | undefined,
  setupSawOpts: undefined as { onAuthFatal?: "degrade" | "throw" } | undefined,
  cacheCalls: 0,
  refreshStops: 0,
}

beforeEach(async () => {
  __resetAuthControllerForTests()
  __resetAuthRecoveryDepsForTests()
  state.githubToken = undefined
  state.copilotToken = undefined
  state.userName = undefined
  harness.preflight = () => Promise.resolve(null)
  harness.setup = () => Promise.resolve()
  harness.setupSawToken = undefined
  harness.setupSawOpts = undefined
  harness.cacheCalls = 0
  harness.refreshStops = 0
  __setAuthControllerDepsForTests({
    stopCopilotRefreshLoop: () => {
      harness.refreshStops++
    },
  })
  __setAuthRecoveryDepsForTests({
    preflightCopilotError: (t, l) => harness.preflight(t, l),
    setupCopilotToken: (opts) => {
      harness.setupSawToken = state.githubToken
      harness.setupSawOpts = opts
      return harness.setup()
    },
    cacheModels: () => {
      harness.cacheCalls++
      return Promise.resolve()
    },
  })
  await resetDefaultTestRegistry()
})

afterEach(async () => {
  __resetAuthRecoveryDepsForTests()
  __resetAuthControllerForTests()
  await resetDefaultTestRegistry()
})

describe("attemptAutoRecovery", () => {
  test("switches LIVE to a known-good account and signs in", async () => {
    // alice is active and just failed (flagged); bob is good.
    let reg = addAndActivate(
      addAndActivate(emptyRegistry(), rec("bob")),
      rec("alice"),
    )
    reg = markNeedsReauth(reg, key("alice"), ERR)
    await writeDefaultRegistry(reg)

    const ok = await attemptAutoRecovery()

    expect(ok).toBe(true)
    expect(harness.setupSawToken).toBe(token("bob")) // minted with bob's token
    // The mint MUST be invoked with onAuthFatal:"throw" — recovery owns the
    // degrade decision; a default ("degrade") would recurse the sweep.
    expect(harness.setupSawOpts).toEqual({ onAuthFatal: "throw" })
    // The live switch repopulates the model catalog for the new identity.
    expect(harness.cacheCalls).toBe(1)
    expect(state.githubToken).toBe(token("bob"))
    expect(state.userName).toBe(login("bob"))
    expect(getAuthStatus()).toMatchObject({
      state: "authenticated",
      account_login: login("bob"),
    })
    const after = await readDefaultRegistry()
    expect(after.activeKey).toBe(key("bob"))
    expect(after.accounts[key("bob")].needsReauth ?? false).toBe(false)
    // The failed account is retained, still flagged — never deleted.
    expect(after.accounts[key("alice")].needsReauth).toBe(true)
    expect(after.accounts[key("alice")].token).toBe(token("alice"))
  })

  test("returns false (and clears state) when every other account is flagged or active", async () => {
    let reg = addAndActivate(
      addAndActivate(emptyRegistry(), rec("bob")),
      rec("alice"),
    )
    reg = markNeedsReauth(reg, key("alice"), ERR) // active, flagged
    reg = markNeedsReauth(reg, key("bob"), ERR) // also flagged → excluded
    await writeDefaultRegistry(reg)

    const ok = await attemptAutoRecovery()

    expect(ok).toBe(false)
    expect(harness.setupSawToken).toBeUndefined() // no mint attempted
    expect(state.githubToken).toBeUndefined()
    expect(getAuthStatus().state).not.toBe("authenticated")
  })

  test("never recovers onto a disabled account", async () => {
    let reg = addAndActivate(emptyRegistry(), rec("bob"))
    reg = setAccountEnabled(reg, key("bob"), false)
    reg = addAndActivate(reg, rec("alice"))
    reg = markNeedsReauth(reg, key("alice"), ERR)
    await writeDefaultRegistry(reg)

    const ok = await attemptAutoRecovery()

    expect(ok).toBe(false)
    expect(harness.setupSawToken).toBeUndefined()
    expect((await readDefaultRegistry()).accounts[key("bob")].enabled).toBe(
      false,
    )
  })

  test("flags a candidate that FAILS preflight and recovers onto the next good one", async () => {
    let reg = addAndActivate(emptyRegistry(), rec("bob"))
    reg = addAndActivate(reg, rec("carol"))
    reg = addAndActivate(reg, rec("alice")) // alice active
    reg = markNeedsReauth(reg, key("alice"), ERR)
    await writeDefaultRegistry(reg)
    harness.preflight = (_t, candidateLogin) =>
      Promise.resolve(
        candidateLogin === login("bob") ? "bob has no Copilot" : null,
      )

    const ok = await attemptAutoRecovery()

    expect(ok).toBe(true)
    expect(state.userName).toBe(login("carol"))
    const after = await readDefaultRegistry()
    expect(after.activeKey).toBe(key("carol"))
    expect(after.accounts[key("bob")].needsReauth).toBe(true) // flagged by sweep
    // The recorded reason is the preflight error (not an empty payload).
    expect(after.accounts[key("bob")].lastError?.message).toBe(
      "bob has no Copilot",
    )
    expect(after.accounts[key("bob")].lastError?.status).toBeNull()
  })

  test("flags a candidate that passes preflight but FAILS the live mint (TOCTOU), tries next", async () => {
    let reg = addAndActivate(emptyRegistry(), rec("bob"))
    reg = addAndActivate(reg, rec("carol"))
    reg = addAndActivate(reg, rec("alice"))
    reg = markNeedsReauth(reg, key("alice"), ERR)
    await writeDefaultRegistry(reg)
    // preflight passes for all; the mint throws only for bob's token.
    harness.setup = () =>
      state.githubToken === token("bob") ?
        Promise.reject(new Error("mint 401"))
      : Promise.resolve()

    const ok = await attemptAutoRecovery()

    expect(ok).toBe(true)
    expect(state.userName).toBe(login("carol"))
    const after = await readDefaultRegistry()
    expect(after.accounts[key("bob")].needsReauth).toBe(true)
    // The recorded reason is the thrown mint error (not an empty payload).
    expect(after.accounts[key("bob")].lastError?.message).toBe("mint 401")
    expect(after.activeKey).toBe(key("carol"))
  })
})

describe("setAccountEnabledLive", () => {
  test("disables the active account by stopping refresh and signing out without deleting it", async () => {
    await writeDefaultRegistry(addAndActivate(emptyRegistry(), rec("alice")))
    state.githubToken = token("alice")
    state.copilotToken = "tid=maximal-test-only-copilot;exp=4102444800"
    state.userName = login("alice")
    markSignedIn(login("alice"))

    const result = await setAccountEnabledLive(key("alice"), false)

    expect(result).toEqual({ ok: true })
    expect(getAuthStatus().state).toBe("unauthenticated")
    expect(harness.refreshStops).toBe(1)
    expect(state.githubToken).toBeUndefined()
    expect(state.copilotToken).toBeUndefined()
    const registry = await readDefaultRegistry()
    expect(registry.activeKey).toBeNull()
    expect(registry.accounts[key("alice")].enabled).toBe(false)
    expect(registry.accounts[key("alice")].token).toBe(token("alice"))
  })

  test("returns 404 without changing the registry for an unknown account", async () => {
    const before = addAndActivate(emptyRegistry(), rec("alice"))
    await writeDefaultRegistry(before)

    const result = await setAccountEnabledLive(
      "maximal-test-only-ghost@github.example.invalid",
      false,
    )

    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(await readDefaultRegistry()).toEqual(before)
  })
})

describe("markAuthDegraded → auto-recovery wiring", () => {
  test("invokes the registered recovery and skips the error state on success", async () => {
    let called = 0
    registerAutoRecovery(() => {
      called++
      markSignedIn(login("bob")) // recovery switched live onto another account
      return Promise.resolve(true)
    })
    state.githubToken = "ghu_maximal_test_only_transient_noncredential"

    await markAuthDegraded(new CopilotAuthFatalError("revoked", 401, null))

    expect(called).toBe(1)
    expect(getAuthStatus()).toMatchObject({
      state: "authenticated",
      account_login: login("bob"),
    })
  })

  test("falls to the error state when recovery finds no good account", async () => {
    registerAutoRecovery(() => Promise.resolve(false))
    state.githubToken = "ghu_maximal_test_only_transient_noncredential"

    await markAuthDegraded(
      new CopilotAuthFatalError("revoked", 401, "https://x"),
    )

    expect(getAuthStatus()).toMatchObject({ state: "error", error: "revoked" })
  })
})

describe("activateAccountLive (user-initiated switch)", () => {
  test("switches live to the chosen account and signs in", async () => {
    // bob active, alice inactive; the user switches to alice.
    const reg = addAndActivate(
      addAndActivate(emptyRegistry(), rec("alice")),
      rec("bob"),
    )
    await writeDefaultRegistry(reg)

    const result = await activateAccountLive(key("alice"))

    expect(result.ok).toBe(true)
    expect(harness.setupSawToken).toBe(token("alice")) // minted with alice's token
    expect(getAuthStatus().state).toBe("authenticated")
    expect((await readDefaultRegistry()).activeKey).toBe(key("alice"))
  })

  test("404 for an unknown account key", async () => {
    const result = await activateAccountLive(
      "maximal-test-only-ghost@github.example.invalid",
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.message).toContain("No account")
    }
  })

  test("422 when the target fails preflight (never mints)", async () => {
    await writeDefaultRegistry(addAndActivate(emptyRegistry(), rec("alice")))
    harness.preflight = () => Promise.resolve("quota exhausted")

    const result = await activateAccountLive(key("alice"))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(422)
      expect(result.message).toBe("quota exhausted")
    }
    expect(harness.setupSawToken).toBeUndefined()
  })
})
