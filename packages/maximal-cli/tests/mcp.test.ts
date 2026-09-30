import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { McpServer } from "@modelcontextprotocol/server"
import assert from "node:assert/strict"
import test from "node:test"

import {
  CommandCatalog,
  CommandError,
  createCommandContext,
} from "../src/index.ts"
import {
  MAXIMAL_MCP_OUTCOME_META_KEY,
  registerCatalogAsMcpTools,
  registerCommandAsMcpTool,
} from "../src/mcp.ts"
import { echoInputSchema, echoOutputSchema } from "./fixtures.ts"
import { echoCommand } from "./fixtures.ts"

void test("MCP outcome metadata key is stable", () => {
  assert.equal(MAXIMAL_MCP_OUTCOME_META_KEY, "dev.maximal.command/outcome")
})

void test("official MCP client discovers and invokes a command projection", async () => {
  const server = new McpServer({
    name: "maximal-cli-conformance",
    version: "1.0.0",
  })
  let contextRequest:
    | {
        readonly id: string | number
        readonly signal: AbortSignal
        readonly sessionId?: string
      }
    | undefined
  registerCommandAsMcpTool(server, echoCommand, {
    createContext: (request) => {
      contextRequest = request
      return createCommandContext({
        id: String(request.id),
        signal: request.signal,
        transport: "mcp",
      })
    },
  })
  const client = new Client({
    name: "maximal-cli-conformance-client",
    version: "1.0.0",
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const listing = await client.listTools()
    assert.deepEqual(listing.tools, [
      {
        name: "echo",
        title: "Echo",
        icons: undefined,
        description: "Returns the supplied message.",
        inputSchema: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
          $schema: "https://json-schema.org/draft/2020-12/schema",
        },
        outputSchema: {
          type: "object",
          properties: { echoed: { type: "string" } },
          required: ["echoed"],
          $schema: "https://json-schema.org/draft/2020-12/schema",
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        execution: undefined,
        _meta: undefined,
      },
    ])

    const result = await client.callTool({
      name: "echo",
      arguments: { message: "through MCP" },
    })
    assert.equal(result.isError, undefined)
    assert.deepEqual(result.content, [
      { type: "text", text: '{"echoed":"through MCP"}' },
    ])
    assert.deepEqual(result.structuredContent, { echoed: "through MCP" })
    assert.ok(contextRequest)
    assert.equal(contextRequest.id, 2)
    assert.equal(contextRequest.signal.aborted, false)
    assert.equal(contextRequest.sessionId, undefined)
  } finally {
    await client.close()
    await server.close()
  }
})

void test("official MCP server rejects input before command execution", async () => {
  const server = new McpServer({
    name: "maximal-cli-validation",
    version: "1.0.0",
  })
  registerCommandAsMcpTool(server, echoCommand, {
    createContext: (request) =>
      createCommandContext({
        id: String(request.id),
        signal: request.signal,
        transport: "mcp",
      }),
  })
  const client = new Client({
    name: "maximal-cli-validation-client",
    version: "1.0.0",
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const result = await client.callTool({
      name: "echo",
      arguments: { message: 42 },
    })
    assert.equal(result.isError, true)
  } finally {
    await client.close()
    await server.close()
  }
})

void test("default MCP contexts identify their transport", async () => {
  const server = new McpServer({
    name: "maximal-cli-default-context",
    version: "1.0.0",
  })
  registerCommandAsMcpTool(server, {
    ...echoCommand,
    name: "context",
    execute(input, context) {
      assert.equal(context.invocation.transport, "mcp")
      assert.equal(context.invocation.interactive, false)
      assert.equal(context.invocation.id, "1")
      return Promise.resolve({ echoed: input.message })
    },
  })
  const client = new Client({
    name: "maximal-cli-default-context-client",
    version: "1.0.0",
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const result = await client.callTool({
      name: "context",
      arguments: { message: "context" },
    })
    assert.deepEqual(result.structuredContent, { echoed: "context" })
  } finally {
    await client.close()
    await server.close()
  }
})

void test("MCP tools follow a dynamic command catalog", async () => {
  const catalog = new CommandCatalog()
  catalog.register({ ...echoCommand, name: "zulu" })
  const server = new McpServer({
    name: "maximal-cli-dynamic",
    version: "1.0.0",
  })
  const unregister = registerCatalogAsMcpTools(server, catalog)
  const client = new Client({
    name: "maximal-cli-dynamic-client",
    version: "1.0.0",
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name),
      ["zulu"],
    )
    catalog.register({ ...echoCommand, name: "alpha" })
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name),
      ["alpha", "zulu"],
    )
    const result = await client.callTool({
      name: "alpha",
      arguments: { message: "dynamic" },
    })
    assert.deepEqual(result.structuredContent, { echoed: "dynamic" })
    catalog.remove("zulu")
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name),
      ["alpha"],
    )
    unregister()
    assert.deepEqual((await client.listTools()).tools, [])
    catalog.register({ ...echoCommand, name: "after-unsubscribe" })
    assert.deepEqual((await client.listTools()).tools, [])
  } finally {
    await client.close()
    await server.close()
  }
})

void test("MCP failures retain the Maximal structured outcome", async () => {
  const server = new McpServer({
    name: "maximal-cli-errors",
    version: "1.0.0",
  })
  registerCommandAsMcpTool(
    server,
    {
      ...echoCommand,
      name: "fail",
      execute() {
        throw new CommandError({
          kind: "conflict",
          code: "MAXIMAL_TEST_CONFLICT",
          message: "The fixture is conflicted.",
          retryable: true,
          details: { fixture: true },
        })
      },
    },
    {},
  )
  const client = new Client({
    name: "maximal-cli-error-client",
    version: "1.0.0",
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const result = await client.callTool({
      name: "fail",
      arguments: { message: "fail" },
    })
    assert.equal(result.isError, true)
    assert.deepEqual(result.content, [
      { type: "text", text: "The fixture is conflicted." },
    ])
    assert.deepEqual(result._meta?.[MAXIMAL_MCP_OUTCOME_META_KEY], {
      contract: "dev.maximal.command",
      schemaVersion: 1,
      invocationId: "1",
      ok: false,
      error: {
        kind: "conflict",
        code: "MAXIMAL_TEST_CONFLICT",
        message: "The fixture is conflicted.",
        retryable: true,
        details: { fixture: true },
      },
    })
  } finally {
    await client.close()
    await server.close()
  }
})

void test("official MCP cancellation reaches the command signal", async () => {
  let markStarted: (() => void) | undefined
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  let observedAbort: (() => void) | undefined
  const aborted = new Promise<void>((resolve) => {
    observedAbort = resolve
  })
  const server = new McpServer({
    name: "maximal-cli-cancellation",
    version: "1.0.0",
  })
  registerCommandAsMcpTool(
    server,
    {
      name: "wait",
      title: "Wait",
      description: "Waits until cancelled.",
      inputSchema: echoInputSchema,
      outputSchema: echoOutputSchema,
      async execute(_input, context) {
        markStarted?.()
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              observedAbort?.()
              resolve()
            },
            { once: true },
          )
        })
        return { echoed: "cancelled" }
      },
    },
    {
      createContext: (request) =>
        createCommandContext({
          id: String(request.id),
          signal: request.signal,
          transport: "mcp",
        }),
    },
  )
  const client = new Client({
    name: "maximal-cli-cancellation-client",
    version: "1.0.0",
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const controller = new AbortController()
    const request = client.callTool(
      { name: "wait", arguments: { message: "wait" } },
      { signal: controller.signal },
    )
    await started
    controller.abort()
    await assert.rejects(
      request,
      (error: unknown) =>
        error instanceof Error
        && error.name === "SdkError"
        && error.message.includes("AbortError"),
    )
    await aborted
  } finally {
    await client.close()
    await server.close()
  }
})
