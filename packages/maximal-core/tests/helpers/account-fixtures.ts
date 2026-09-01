import {
  accountKey,
  emptyRegistry,
  makeAccountRecord,
  type AccountKey,
  type AccountRecord,
  type TokenType,
  writeDefaultRegistry,
} from "~/lib/auth/github-token-store"

export type TestAccountName = "alice" | "bob" | "carol"

export const TEST_ACCOUNT_HOST = "github.example.invalid"

export function testAccountLogin(name: TestAccountName): string {
  return `maximal-test-only-${name}`
}

export function testAccountToken(
  name: TestAccountName,
  tokenType: Exclude<TokenType, "unknown"> = "ghu_",
): string {
  return `${tokenType}maximal_test_only_${name}_noncredential`
}

export function testAccountKey(name: TestAccountName): AccountKey {
  return accountKey(testAccountLogin(name), TEST_ACCOUNT_HOST)
}

export function resetDefaultTestRegistry(): Promise<void> {
  return writeDefaultRegistry(emptyRegistry())
}

export function makeTestAccount(
  name: TestAccountName,
  tokenType: Exclude<TokenType, "unknown"> = "ghu_",
): AccountRecord {
  return makeAccountRecord({
    login: testAccountLogin(name),
    host: TEST_ACCOUNT_HOST,
    token: testAccountToken(name, tokenType),
    addedVia: "device-code",
  })
}
