import type { ByteWriter } from "../../src/stdio.ts"

import { registerCommand } from "../../src/index.ts"
import { runJsonLinesStdio } from "../../src/stdio.ts"
import { echoCommand } from "../fixtures.ts"

function writer(stream: NodeJS.WritableStream): ByteWriter {
  return {
    write(chunk) {
      return new Promise((resolve, reject) => {
        stream.write(chunk, (error?: Error | null) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

await runJsonLinesStdio({
  commands: [registerCommand(echoCommand)],
  stdin: process.stdin,
  stdout: writer(process.stdout),
  stderr: writer(process.stderr),
})
