import { McpServer } from '@modelcontextprotocol/server'
import { serverInfo } from './variables.js'

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: serverInfo.name,
    version: serverInfo.version,
  })
  return server
}
