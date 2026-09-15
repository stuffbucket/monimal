import { startDshHost, type ActivationSnapshot } from "../src/index.ts"

const args = process.argv.slice(2)
if (args.length !== 3)
  throw new Error(
    "usage: compiled-bun-entry <profile> <activation-json> <provider>",
  )
const [profileDirectory, activationJson, provider] = args as [
  string,
  string,
  string,
]
const activation = JSON.parse(activationJson) as ActivationSnapshot
await using host = await startDshHost({ profileDirectory, activation })
const signal = new AbortController().signal
const response = await host.dispatch({
  operation: "models",
  provider,
  request: new Request("http://localhost/v1/models"),
  signal,
})
if (!response.ok)
  throw new Error(`compiled external import returned ${response.status}`)
process.stdout.write(await response.text())
