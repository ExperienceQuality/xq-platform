# Project deliverables

This table is the project-level inventory. Package-specific implementation
details live beside each package.

| Deliverable             | Location                                                      | What it provides                                                   | Consumer value                                          |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Backend REST client     | `packages/rest-client/`                                       | PactumJS-backed fluent HTTP requests with request/response capture | Test application APIs and inspect the complete exchange |
| Database kit            | `packages/db/`                                                | Typed PostgreSQL clients built with Kysely and `pg`                | Use named, type-safe database connections in tests      |
| Stub server kit         | `packages/stub/`                                              | PactumJS mock server and interaction lifecycle                     | Stub downstream services with per-test cleanup          |
| Core runtime            | `packages/core/`                                              | Run context, backend process, REST, and stub composition           | Share one platform-owned test lifecycle                 |
| Public Node test facade | `packages/test/`                                              | `@experiencequality/test` package and Vitest adapter               | Import the supported test API from one package          |
| Browser test facade     | `packages/test-browser/`                                      | `@experiencequality/test-browser` package and Playwright adapter   | Run browser E2E tests on the same platform kit          |
| Consumer showcase       | `apps/backend-e2e/`                                           | Packed-package backend E2E example                                 | Verify the documented consumer workflow end to end      |
| Browser showcase        | `apps/browser-e2e/`                                           | Playwright consumer example in a real Chromium run                 | Verify the browser facade end to end                    |
| Release verification    | `scripts/verify-structure.mjs`, `scripts/verify-packages.mjs` | Workspace boundary and fresh-consumer archive checks               | Catch broken package boundaries before release          |
