import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"

async function exerciseMcpStdio(
  mode: "auto" | "legacy",
  expectedVersion: string,
  expectedEra: "modern" | "legacy",
): Promise<void> {
  const fixture = fileURLToPath(
    new URL("./fixtures/mcp-stdio-child.ts", import.meta.url),
  )
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixture],
    stderr: "pipe",
  })
  let stderr = ""
  transport.stderr?.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString()
  })
  const client = new Client(
    {
      name: "maximal-cli-stdio-client",
      version: "1.0.0",
    },
    {
      versionNegotiation: {
        mode,
      },
    },
  )

  await client.connect(transport)
  try {
    assert.equal(client.getNegotiatedProtocolVersion(), expectedVersion)
    assert.equal(client.getProtocolEra(), expectedEra)
    assert.deepEqual(client.getServerVersion(), {
      name: "maximal-cli-stdio-conformance",
      version: "1.0.0",
    })
    assert.deepEqual(client.getServerCapabilities(), {
      tools: { listChanged: true },
    })
    const listing = await client.listTools()
    assert.deepEqual(
      listing.tools.map((tool) => tool.name),
      ["echo"],
    )
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "through official stdio" },
    })
    assert.deepEqual(result.structuredContent, {
      echoed: "through official stdio",
    })
  } finally {
    await client.close()
  }

  assert.equal(stderr, "")
}

void test("official MCP stdio serves modern discovery and tool calls", async () => {
  await exerciseMcpStdio("auto", "2026-07-28", "modern")
})

void test("official MCP stdio retains legacy initialization", async () => {
  await exerciseMcpStdio("legacy", "2025-11-25", "legacy")
})
