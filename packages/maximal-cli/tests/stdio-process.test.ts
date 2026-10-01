import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

void test("shell-free stdio keeps machine output separate", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/stdio-child.ts", import.meta.url),
  )
  const child = spawn(process.execPath, [fixture], {
    cwd: path.dirname(fixture),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  child.stdin.end(
    '{"type":"invoke","id":"pipe-1","command":"echo",'
      + '"input":{"message":"through pipe"}}\r\n',
  )

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })

  assert.equal(exitCode, 0)
  assert.equal(stderr, "")
  assert.deepEqual(JSON.parse(stdout), {
    contract: "dev.maximal.command",
    schemaVersion: 1,
    invocationId: "pipe-1",
    ok: true,
    data: { echoed: "through pipe" },
  })
})
