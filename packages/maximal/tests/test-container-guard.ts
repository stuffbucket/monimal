const testContainerEnv = "MAXIMAL_TEST_CONTAINER"

if (process.env[testContainerEnv] !== "1") {
  throw new Error(
    "Refusing to run Maximal tests outside the disposable Docker container."
      + " Run `pnpm test` from the monorepo root instead of invoking"
      + " `bun test` directly.",
  )
}
