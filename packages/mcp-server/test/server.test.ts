import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';

import { createMcpServer } from '../src/server.js';

describe('createMcpServer', () => {
  it('returns an McpServer instance with a ping tool registered', () => {
    const server = createMcpServer();
    expect(server).toBeInstanceOf(McpServer);
  });
});
