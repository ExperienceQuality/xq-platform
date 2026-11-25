# @experiencequality/showcase-xq-mcp-e2e

Private stdio E2E verification for `@experiencequality/xq-mcp`. Spawns the
compiled `xq-mcp` binary and exercises the `ping` tool through
`@modelcontextprotocol/client`. Never published.

## Run

```sh
pnpm run test:e2e:xq-mcp   # from the repository root
```

Requires a prior `pnpm run build` so `packages/xq-mcp/dist/bin/xq-mcp.js`
exists (the root script builds first).
