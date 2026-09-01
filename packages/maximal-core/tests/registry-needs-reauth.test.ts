/**
 * Registry-level guarantees for the non-destructive auth model. The headline
 * fix is that an upstream rejection must NEVER delete the stored credential —
 * it flags the account `needsReauth` and RETAINS the record (token included).
 * These tests pin the pure helpers + their persistence round-trip, independent
 * of the auth-controller behaviour tests.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  addAndActivate,
  clearNeedsReauth,
  deactivate,
  emptyRegistry,
  markNeedsReauth,
  readRegistry,
  writeRegistry,
} from "~/lib/auth/github-token-store"

import {
  makeTestAccount,
  testAccountKey,
  testAccountToken,
} from "./helpers/account-fixtures"

function seed() {
  // Two unmistakable test accounts, the first active.
  const a = makeTestAccount("alice")
  const b = { ...makeTestAccount("bob"), addedVia: "gh-cli" as const }
  return addAndActivate(addAndActivate(emptyRegistry(), b), a) // a ends active
}

const KEY_A = testAccountKey("alice")
const KEY_B = testAccountKey("bob")
const ERR = {
  status: 401 as number | null,
  message: "revoked",
  at: "2026-06-18T00:00:00.000Z",
}

describe("markNeedsReauth / clearNeedsReauth / deactivate (pure)", () => {
  test("markNeedsReauth flags the account + records the error but RETAINS its token", () => {
    const reg = markNeedsReauth(seed(), KEY_A, ERR)
    const rec = reg.accounts[KEY_A]
    expect(rec.needsReauth).toBe(true)
    expect(rec.lastError).toEqual(ERR)
    // The credential is retained — this is the whole point.
    expect(rec.token).toBe(testAccountToken("alice"))
    // The active pointer is untouched (the account stays the boot default and
    // gets re-attempted on the next restart — a transient rejection self-heals).
    expect(reg.activeKey).toBe(KEY_A)
    // The OTHER account is untouched.
    expect(reg.accounts[KEY_B].needsReauth).toBeUndefined()
  })

  test("markNeedsReauth is a no-op for an absent key", () => {
    const reg = seed()
    expect(markNeedsReauth(reg, "nobody@github.com", ERR)).toBe(reg)
  })

  test("clearNeedsReauth wipes the flag + error", () => {
    const flagged = markNeedsReauth(seed(), KEY_A, ERR)
    const cleared = clearNeedsReauth(flagged, KEY_A)
    expect(cleared.accounts[KEY_A].needsReauth).toBe(false)
    expect(cleared.accounts[KEY_A].lastError).toBeNull()
  })

  test("deactivate drops the active pointer but keeps every record", () => {
    const reg = deactivate(seed())
    expect(reg.activeKey).toBeNull()
    expect(Object.keys(reg.accounts)).toHaveLength(2)
    expect(reg.accounts[KEY_A].token).toBe(testAccountToken("alice"))
  })
})

describe("persistence: a degrade does not empty the registry", () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maximal-reg-"))
    path = join(dir, "accounts.json")
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("flagging needs-reauth and persisting RETAINS the account (the bug fix)", async () => {
    await writeRegistry(path, markNeedsReauth(seed(), KEY_A, ERR))
    const reloaded = await readRegistry(path)

    // Critically NOT empty — the credential survived the rejection.
    expect(Object.keys(reloaded.accounts)).toHaveLength(2)
    expect(reloaded.activeKey).toBe(KEY_A)
    expect(reloaded.accounts[KEY_A].token).toBe(testAccountToken("alice"))
    expect(reloaded.accounts[KEY_A].needsReauth).toBe(true)
    expect(reloaded.accounts[KEY_A].lastError).toEqual(ERR)
  })

  test("a registry written WITHOUT the new fields round-trips cleanly (backward compatible)", async () => {
    // Simulate a registry from before needsReauth existed.
    await writeRegistry(path, seed())
    const reloaded = await readRegistry(path)
    expect(reloaded.accounts[KEY_A].needsReauth).toBeUndefined()
    expect(reloaded.accounts[KEY_A].lastError).toBeUndefined()
    // And the new helpers operate on it without crashing.
    expect(() => markNeedsReauth(reloaded, KEY_A, ERR)).not.toThrow()
  })
})
