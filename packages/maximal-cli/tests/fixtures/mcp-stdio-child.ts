import { McpServer } from "@modelcontextprotocol/server"

import { registerCommandAsMcpTool, serveMcpStdio } from "../../src/mcp.ts"
import { echoCommand } from "../fixtures.ts"

serveMcpStdio(() => {
  const server = new McpServer({
    name: "maximal-cli-stdio-conformance",
    version: "1.0.0",
  })
  registerCommandAsMcpTool(server, echoCommand, {})
  return server
})
