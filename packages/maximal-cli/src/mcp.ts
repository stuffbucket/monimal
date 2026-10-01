import type { RegisteredTool } from "@modelcontextprotocol/server"

import { McpServer } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"

import type {
  CommandCatalog,
  CommandContext,
  CommandDefinition,
  CommandRegistration,
  JsonObject,
} from "./index.ts"

import { createCommandContext, registerCommand } from "./index.ts"

export const MAXIMAL_MCP_OUTCOME_META_KEY = "dev.maximal.command/outcome"

export interface McpCommandAdapterOptions {
  createContext?(request: {
    readonly id: string | number
    readonly signal: AbortSignal
    readonly sessionId?: string
  }): CommandContext
}

export function registerCommandAsMcpTool<
  Input extends JsonObject,
  Output extends JsonObject,
>(
  server: McpServer,
  command: CommandDefinition<Input, Output>,
  options: McpCommandAdapterOptions = {},
): RegisteredTool {
  return registerRegistrationAsMcpTool(
    server,
    registerCommand(command),
    options,
  )
}

function registerRegistrationAsMcpTool(
  server: McpServer,
  command: CommandRegistration,
  options: McpCommandAdapterOptions,
): RegisteredTool {
  return server.registerTool(
    command.name,
    {
      title: command.title,
      description: command.description,
      inputSchema: command.inputSchema,
      outputSchema: command.outputSchema,
      annotations: {
        readOnlyHint: command.annotations?.readOnly,
        destructiveHint: command.annotations?.destructive,
        idempotentHint: command.annotations?.idempotent,
        openWorldHint: command.annotations?.openWorld,
      },
    },
    async (input, request) => {
      const commandRequest = {
        id: request.mcpReq.id,
        signal: request.mcpReq.signal,
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      }
      const context =
        options.createContext?.(commandRequest)
        ?? createCommandContext({
          id: String(commandRequest.id),
          signal: commandRequest.signal,
          transport: "mcp",
        })
      const outcome = await command.execute(input, context)
      if (!outcome.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: outcome.error.message }],
          _meta: {
            [MAXIMAL_MCP_OUTCOME_META_KEY]: outcome,
          },
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify(outcome.data) }],
        structuredContent: outcome.data,
      }
    },
  )
}

export function registerCatalogAsMcpTools(
  server: McpServer,
  catalog: CommandCatalog,
  options: McpCommandAdapterOptions = {},
): () => void {
  let tools: Array<RegisteredTool> = []

  const reconcile = () => {
    for (const tool of tools) tool.remove()
    tools = catalog
      .list()
      .map((command) => registerRegistrationAsMcpTool(server, command, options))
  }

  reconcile()
  const unsubscribe = catalog.subscribe(reconcile)
  return () => {
    unsubscribe()
    for (const tool of tools) tool.remove()
  }
}

export function serveMcpStdio(
  factory: Parameters<typeof serveStdio>[0],
  options: Parameters<typeof serveStdio>[1] = {},
): ReturnType<typeof serveStdio> {
  return serveStdio(factory, {
    legacy: "serve",
    ...options,
  })
}
