import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { clearTimeout, setTimeout } from "node:timers"
import { fileURLToPath, URL } from "node:url"

/** Start the owned Core process in the smoke's isolated home; never touch a running user's proxy. */
export async function startCoreFixture(upstream, environment) {
  const home = join(environment.HOME, "maximal")
  await mkdir(home, { mode: 0o700 })
  await writeFile(
    join(home, "config.json"),
    JSON.stringify({
      auth: { enforce: true, apiKeys: [environment.MAXIMAL_PI_SMOKE_KEY] },
      providerHost: { mode: "plugins" },
      checkUpdates: false,
    }),
    { mode: 0o600 },
  )
  const fixture = fileURLToPath(
    new URL("../../maximal-core/scripts/dev/pi-fixture.ts", import.meta.url),
  )
  const child = spawn(process.env.MAXIMAL_BUN_BINARY ?? "bun", [fixture], {
    env: {
      ...environment,
      MAXIMAL_HOME: home,
      MAXIMAL_PI_FIXTURE_UPSTREAM: upstream,
    },
    cwd: fileURLToPath(new URL("../../maximal-core", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
      const timer = setTimeout(() => child.kill("SIGKILL"), 2_000)
      try {
        await exited
      } finally {
        clearTimeout(timer)
      }
    }
    // Core's ancillary workers may inherit output descriptors. The fixture
    // owns these read pipes and must close them independently of worker exit.
    child.stdout.destroy()
    child.stderr.destroy()
  }
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error("The isolated Core fixture did not announce readiness."),
          ),
        10_000,
      )
      let output = ""
      child.once("error", () => {
        clearTimeout(timer)
        reject(new Error("Could not launch the isolated Core fixture."))
      })
      child.once("exit", () => {
        clearTimeout(timer)
        reject(new Error("The isolated Core fixture exited before readiness."))
      })
      child.stderr.resume()
      child.stdout.on("data", (chunk) => {
        output += chunk.toString("utf8")
        if (output.length > 1024 * 1024) {
          reject(new Error("Core fixture exceeded its output budget."))
          return
        }
        const lines = output.split("\n")
        output = lines.pop() ?? ""
        for (const line of lines) {
          try {
            const record = JSON.parse(line)
            if (
              record.kind === "pi-fixture-ready"
              && typeof record.origin === "string"
            ) {
              clearTimeout(timer)
              resolve(record.origin)
            }
          } catch {
            /* Core request logs are not readiness records. */
          }
        }
      })
    })
    return { origin, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
