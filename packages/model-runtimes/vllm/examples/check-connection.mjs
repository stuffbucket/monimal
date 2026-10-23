import { startProviderPluginHost } from "@maximal/maximal-models"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import process from "node:process"
import { URL } from "node:url"

// Explicit real-runtime check, separate from the isolated contract test suite.
// Uses only a fixed synthetic prompt. Never prints credentials or model output.
const [profileDirectory, configPath, provider, model] = process.argv.slice(2)
if (!profileDirectory || !configPath || !provider || !model) {
  throw new Error(
    "Usage: node examples/check-connection.mjs <profile-directory> <connection.json> <provider> <served-model-id>",
  )
}
let config
try {
  config = JSON.parse(await readFile(configPath, "utf8"))
} catch {
  throw new Error("Could not read a valid connection document")
}
const host = await startProviderPluginHost({
  profileDirectory,
  activation: { vllm: { enabled: true, config } },
})
try {
  const target = host.modelTopology
    ?.snapshot()
    .targets.find(
      (entry) =>
        entry.providerAccount.provider === provider && entry.modelId === model,
    )
  assert.ok(
    target?.endpoint.url,
    "The requested deployment must be explicitly configured",
  )
  assert.equal(host.getStatus(provider)?.state, "available")
  const signal = globalThis.AbortSignal.timeout(120_000)
  const models = await host.dispatch({
    provider,
    operation: "models",
    signal,
    request: new globalThis.Request(new URL("/v1/models", target.endpoint.url)),
  })
  assert.equal(models.status, 200)
  assert.ok((await models.json()).data.some((entry) => entry.id === model))
  for (const stream of [false, true]) {
    const response = await host.dispatch({
      provider,
      operation: "messages",
      signal,
      request: new globalThis.Request(
        new URL("/v1/messages", target.endpoint.url),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream,
            max_tokens: 128,
            messages: [
              {
                role: "user",
                content:
                  "Reply with exactly MAXIMAL_CONNECTION_OK. Do not explain.",
              },
            ],
          }),
        },
      ),
    })
    assert.equal(response.status, 200, "Gateway request must succeed")
    const body = await response.text()
    if (stream) {
      assert.ok(
        body.includes("event: message_stop"),
        "Streaming response must terminate successfully",
      )
      assert.ok(
        !body.includes("event: error"),
        "Streaming response must not contain a terminal error",
      )
      const text = body
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)))
        .filter(
          (data) =>
            data.type === "content_block_delta"
            && data.delta?.type === "text_delta",
        )
        .map((data) => data.delta.text)
        .join("")
      assert.ok(
        text.includes("MAXIMAL_CONNECTION_OK"),
        "Streaming text must contain the synthetic marker",
      )
    } else {
      const result = JSON.parse(body)
      assert.equal(result.model, model)
      assert.ok(
        result.content.some(
          (block) =>
            block.type === "text"
            && block.text.includes("MAXIMAL_CONNECTION_OK"),
        ),
      )
    }
    process.stdout.write(
      `${JSON.stringify({ provider, model, location: target.location, operation: "messages", stream, status: response.status })}\n`,
    )
  }
} finally {
  await host.dispose()
}
