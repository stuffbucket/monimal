#!/usr/bin/env node

import { runEvaluationCli } from "./evaluation-runner.ts"

try {
  const result = await runEvaluationCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    `${JSON.stringify({ status: "ERROR", error: message })}\n`,
  )
  process.exitCode = 1
}
