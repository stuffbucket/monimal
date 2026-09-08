#!/usr/bin/env node

import fs from "node:fs"

function usage(message) {
  if (message) console.error(`error: ${message}`)
  console.error("usage: assert-ci-run.mjs --sha <sha> --workflow-id <id> --runs-file <json>")
  process.exit(2)
}

function option(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) usage(`missing ${name}`)
  return process.argv[index + 1]
}

function workflowRuns(value) {
  if (Array.isArray(value)) return value.flatMap(workflowRuns)
  if (value && Array.isArray(value.workflow_runs)) return value.workflow_runs
  return []
}

const sha = option("--sha")
const workflowId = option("--workflow-id")
const runsFile = option("--runs-file")

let payload
try {
  payload = JSON.parse(fs.readFileSync(runsFile, "utf8"))
} catch (error) {
  usage(`cannot read ${runsFile}: ${error.message}`)
}

const runs = workflowRuns(payload).filter(
  (run) => String(run.workflow_id) === workflowId && run.head_sha === sha,
)
const successful = runs.filter(
  (run) => run.status === "completed" && run.conclusion === "success",
)

if (successful.length > 0) {
  console.log(`CI workflow ${workflowId} completed successfully on ${sha}: run ${successful[0].id}`)
  process.exit(0)
}

if (runs.length === 0) {
  console.error(`::error::CI workflow ${workflowId} has no runs for ${sha}.`)
  process.exit(1)
}

const states = runs.map((run) => `${run.id ?? "unknown"}=${run.status}/${run.conclusion ?? "null"}`)
console.error(
  `::error::CI workflow ${workflowId} has no completed successful run for ${sha}: ${states.join(", ")}.`,
)
process.exit(1)