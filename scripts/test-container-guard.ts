const testContainerEnv = "MAXIMAL_TEST_CONTAINER"

if (process.env[testContainerEnv] !== "1") {
  throw new Error(
    "Refusing to run repository tests outside the disposable Docker container."
      + " Run `pnpm test` instead of invoking `bun test` directly.",
  )
}
