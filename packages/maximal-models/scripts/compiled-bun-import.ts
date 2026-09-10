import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createFixtureProfile } from "../tests/fixture.ts"

async function command(
  executable: string,
  args: Array<string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk
    })
    child.once("error", reject)
    child.once("exit", (code) => resolve({ code, stdout, stderr }))
  })
}

const outputDirectory = await mkdtemp(join(tmpdir(), "maximal-dsh-bun-"))
try {
  const executable = join(outputDirectory, "external-import-smoke")
  const entry = new URL("./compiled-bun-entry.ts", import.meta.url).pathname
  const built = await command(process.execPath, [
    "build",
    entry,
    "--compile",
    "--compile-autoload-package-json",
    "--outfile",
    executable,
  ])
  assert.equal(built.code, 0, built.stderr)
  const fixture = await createFixtureProfile()
  const run = await command(executable, [
    fixture.directory,
    JSON.stringify({ fixture: { enabled: true, config: {} } }),
    "fixture",
  ])
  assert.equal(run.code, 0, run.stderr)
  const result = JSON.parse(run.stdout) as { data: Array<{ id: string }> }
  assert.deepEqual(
    result.data.map((model) => model.id),
    ["fixture-model"],
  )
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
