# @experiencequality/xq-mcp

CLI-only Model Context Protocol (MCP) server (`xq-mcp`) for the XQ platform.
Ships a compiled stdio binary; there is no public library `exports` entrypoint.

## Installation

Published to the company GitHub Packages npm registry under `@experiencequality`
— see [`../../docs/consumer-guide.md`](../../docs/consumer-guide.md).

```bash
pnpm add --save-dev @experiencequality/xq-mcp
```

Requires Node.js 24 or newer.

## Usage

```bash
pnpm exec xq-mcp
```

The process speaks MCP over stdio. Diagnostic messages go to stderr only; stdout
is reserved for the protocol. The server registers a `ping` health-check tool
that returns the text `ok`.

## Development

```bash
pnpm --filter @experiencequality/xq-mcp run build
pnpm --filter @experiencequality/xq-mcp run test
pnpm run test:e2e:xq-mcp
```

The private showcase at `apps/xq-mcp-e2e` connects a real MCP client to the
compiled `xq-mcp` binary.
