# @experiencequality/test-browser

Platform-owned Playwright foundation for browser functional E2E tests. Mirrors the
`@experiencequality/test` Vitest facade: `defineConfig` from `./config` applies XQ
defaults and kit lifecycle options (`application`, `databases`, `mock`); the `kit`
fixture exposes the stub client, database clients, REST client, and run context.
