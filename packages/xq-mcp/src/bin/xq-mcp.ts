#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from '../server.js';

console.error('xq-mcp listening on stdio');
serveStdio(() => createMcpServer());
