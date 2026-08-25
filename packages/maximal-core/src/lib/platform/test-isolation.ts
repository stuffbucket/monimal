export const TEST_CONTAINER_ENV = "MAXIMAL_TEST_CONTAINER"
export const TEST_CONTAINER_VALUE = "1"

function isBunTestProcess(): boolean {
  // casts-keep: Bun is an optional runtime global (absent under Node).
  const bun = (globalThis as { Bun?: unknown }).Bun
  if (bun === undefined) return false
  return (
    process.env.NODE_ENV === "test" || process.argv.slice(1).includes("test")
  )
}

/**
 * Refuse to derive a writable user path in a Bun test process when both the
 * disposable-container marker and the path's explicit override are absent.
 *
 * Package preloads enforce the stronger policy that normal tests never run on
 * the host. This check is deliberately independent of Bun configuration so a
 * root-CWD invocation or `--config /dev/null` still fails before `os.homedir()`
 * can select real user state.
 */
export function assertIsolatedTestPath(
  override: string | undefined,
  overrideName: string,
): void {
  if (!isBunTestProcess()) return
  if (process.env[TEST_CONTAINER_ENV] === TEST_CONTAINER_VALUE) return
  if (override?.trim()) return
  throw new Error(
    `Refusing to resolve a default user path during bun test: ${TEST_CONTAINER_ENV}`
      + `=${TEST_CONTAINER_VALUE} and an explicit ${overrideName} are both absent.`
      + " Run the suite through `pnpm test` so it executes in the disposable"
      + " Docker test container.",
  )
}
