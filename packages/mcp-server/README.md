# @experiencequality/mcp-server

CLI-only Model Context Protocol (MCP) server (`xq-mcp`) for the XQ platform.
Ships a compiled stdio binary; there is no public library `exports` entrypoint.

## Installation

Published to the company GitHub Packages npm registry under `@experiencequality`
— see [`../../docs/consumer-guide.md`](../../docs/consumer-guide.md).

```bash
pnpm add --save-dev @experiencequality/mcp-server
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
pnpm --filter @experiencequality/mcp-server run build
pnpm --filter @experiencequality/mcp-server run test
pnpm run test:e2e:mcp
```

The private showcase at `apps/mcp-server-e2e` connects a real MCP client to the
compiled `xq-mcp` binary.
