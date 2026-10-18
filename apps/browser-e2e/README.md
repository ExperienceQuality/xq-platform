# @experiencequality/showcase-browser-e2e

Private consumer app proving `@experiencequality/test-browser` end-to-end with
Playwright — mirrors `apps/backend-e2e` for the Vitest facade.

- `src/server.ts` — minimal `node:http` static server for `src/app/`, started by
  the kit `application` lifecycle in `globalSetup`.
- `playwright.config.ts` — kit `defineConfig` plus consumer `testDir`/`projects`.
- `test/app.spec.ts` — uses `test`/`expect`/`kit` from
  `@experiencequality/test-browser` in a real Playwright worker.

```bash
pnpm exec playwright install chromium   # once
pnpm run test                            # playwright test
```
