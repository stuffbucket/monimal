import { discoverPiModels } from "./catalog.ts"
import { readPiDiscoveryConfig } from "./config.ts"

/** Read-only CLI: stdout is structured inventory, never credentials or model output. */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "Usage: pnpm pi:models [--config PATH]\nOr set MAXIMAL_PI_CONFIG. Reads configured Maximal inventory only; no inference or changes.\n",
    )
    return
  }
  if (args.length > 0 && (args.length !== 2 || args[0] !== "--config")) {
    throw new Error("Usage: pnpm pi:models [--config PATH]")
  }
  const file = args[1] ?? process.env.MAXIMAL_PI_CONFIG
  if (!file)
    throw new Error(
      "Set MAXIMAL_PI_CONFIG or pass --config PATH to an explicitly reviewed config.",
    )
  const config = await readPiDiscoveryConfig(file)
  const projection = await discoverPiModels(config)
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, origin: config.origin, ...projection }, null, 2)}\n`,
  )
  if (projection.providers.length === 0) process.exitCode = 3
}

try {
  await main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Maximal inventory inspection failed."}\n`,
  )
  process.exitCode = 1
}
