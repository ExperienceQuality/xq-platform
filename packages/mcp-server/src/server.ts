import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'xq-mcp', version: '1.0.6' });
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Health check that returns ok',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: 'text', text: 'ok' }],
    }),
  );
  return server;
}
