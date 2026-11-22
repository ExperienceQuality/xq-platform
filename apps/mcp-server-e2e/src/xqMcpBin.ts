import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the compiled `xq-mcp` CLI in the workspace package. */
export function resolveXqMcpBin(): string {
  return path.resolve(
    fileURLToPath(new URL('../../../packages/mcp-server/dist/bin/xq-mcp.js', import.meta.url)),
  );
}
