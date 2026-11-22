import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { resolveXqMcpBin } from '../src/xqMcpBin.js';

const bin = resolveXqMcpBin();
const transport = new StdioClientTransport({ command: process.execPath, args: [bin] });
const client = new Client({ name: 'mcp-server-e2e', version: '0.1.0' });

beforeAll(async () => {
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
});

test('xq-mcp exposes ping and returns ok', async () => {
  const { tools } = await client.listTools();
  expect(tools.some((t) => t.name === 'ping')).toBe(true);

  const result = await client.callTool({ name: 'ping', arguments: {} });
  expect(result.content).toEqual([{ type: 'text', text: 'ok' }]);
});
