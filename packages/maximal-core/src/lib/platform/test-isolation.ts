import fs from "node:fs"
import path from "node:path"

export const TEST_CONTAINER_ENV = "MAXIMAL_TEST_CONTAINER"
export const TEST_CONTAINER_VALUE = "1"
const TEST_HOST_ENV = "MAXIMAL_TEST_HOST"
const TEST_ROOT_ENV = "MAXIMAL_TEST_ROOT"
const isolatedPathVariables = [
  "HOME",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
]

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative.length > 0
    && !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative)
  )
}

function hasIsolatedHostPaths(): boolean {
  const rootValue = process.env[TEST_ROOT_ENV]
  if (
    process.env[TEST_HOST_ENV] !== "1"
    || !rootValue
    || !path.isAbsolute(rootValue)
  ) {
    return false
  }
  const root = fs.realpathSync(rootValue)
  return isolatedPathVariables.every((name) => {
    const value = process.env[name]
    return Boolean(
      value && path.isAbsolute(value) && isInside(root, fs.realpathSync(value)),
    )
  })
}

function isBunTestProcess(): boolean {
  // casts-keep: Bun is an optional runtime global (absent under Node).
  const bun = (globalThis as { Bun?: unknown }).Bun
  if (bun === undefined) return false
  return (
    process.env.NODE_ENV === "test" || process.argv.slice(1).includes("test")
  )
}

/**
 * Refuse to derive a writable user path in a Bun test process unless the path
 * is explicit, the process runs in the disposable container, or every ambient
 * state path remains inside the native wrapper's private root.
 *
 * This check is independent of Bun configuration so a root-CWD invocation or
 * `--config /dev/null` still fails before default resolution can select real
 * user state.
 */
export function assertIsolatedTestPath(
  override: string | undefined,
  overrideName: string,
): void {
  if (!isBunTestProcess()) return
  if (process.env[TEST_CONTAINER_ENV] === TEST_CONTAINER_VALUE) return
  if (override?.trim()) return
  if (hasIsolatedHostPaths()) return
  throw new Error(
    `Refusing to resolve a default user path during bun test: neither the`
      + ` isolated native test environment, ${TEST_CONTAINER_ENV}=`
      + `${TEST_CONTAINER_VALUE}, nor an explicit ${overrideName} is present.`
      + " Run the suite through `pnpm test`.",
  )
}
