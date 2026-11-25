import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { serverInfo } from './variables.js';
import Ping from './tools/ping.js';
import { HANDLER_OUTPUT_SCHEMA } from './type.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: serverInfo.name,
    version: serverInfo.version,
  });
  const ping = new Ping();
  const tools = ping.provide();
  tools.forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: HANDLER_OUTPUT_SCHEMA,
      },
      async (input: any) => {
        const result = await tool.handler(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  });
  return server;
}
