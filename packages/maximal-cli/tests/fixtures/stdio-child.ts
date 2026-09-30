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

async function* tracedStdin(): AsyncIterable<Uint8Array> {
  const stdin: AsyncIterable<Uint8Array> = process.stdin
  for await (const chunk of stdin) {
    process.stderr.write(
      `stdin chunk ${chunk.byteLength}: ${Buffer.from(chunk).toString("hex")}\n`,
    )
    yield chunk
  }
}

await runJsonLinesStdio({
  commands: [registerCommand(echoCommand)],
  stdin:
    process.env["MAXIMAL_CLI_TRACE_STDIN"] === "1" ?
      tracedStdin()
    : process.stdin,
  stdout: writer(process.stdout),
  stderr: writer(process.stderr),
})
