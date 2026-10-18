# Spec: @experiencequality/test-browser — Playwright test foundation

## Status

Approved on 2026-10-18. Implementation gated by plan and task review.

## Objective

Add a sixth published package, `@experiencequality/test-browser`, that mirrors the
`@experiencequality/test` Vitest facade architecture for Playwright, so XQ organisation
browser-test consumers get the same platform-owned capabilities — mock stub server,
backend lifecycle, database clients, run context, and REST client — enforced through one
shared foundation instead of per-repo `playwright.config.ts` drift.

Primary users: engineers writing browser E2E suites in XQ consumer repos
(e.g. `xq-exercices-miniapp`).

Note: this intentionally extends the SPEC.md "keep five public packages" decision to six.
The restructure spec's compatibility constraints (aligned versions, consumer behavior,
registry) still apply to the existing five.

### Target outcomes

- `packages/test-browser` publishes `@experiencequality/test-browser` to GitHub Packages
  alongside the existing five.
- `@experiencequality/test-browser` exports `test`, `expect`, and the `NodeTestKit`
  fixture for Playwright specs.
- `@experiencequality/test-browser/config` exports `defineConfig` that wraps
  `@playwright/test`'s `defineConfig`, applies XQ-enforced defaults, registers the kit
  global setup, and accepts the same `KitOptions` (`application`, `databases`, `mock`)
  plus consumer Playwright overrides.
- Kit capabilities parity with the Vitest facade: pactum stub server, backend process
  lifecycle, database clients, run context, REST client, interaction capture.
- `@playwright/test` is a peer dependency of the new package.
- Existing five packages and their public contracts stay unchanged.

### Non-goals

- No visual regression, component-testing, or device-farm capability in this slice.
- No device/viewport project matrix in the package — `projects` is consumer choice,
  permanently, not a deferred enforcement.
- No change to `@experiencequality/test`'s `./vitest` or `./cucumber` contracts.
- No Playwright support inside `@experiencequality/test` itself; browser capability lives
  only in the new package.

## Tech Stack

- `@playwright/test` peer (range `>=1.64 <2` — confirm against consumer pin `1.64.0`).
- Same stack as SPEC.md: Node 24+, pnpm 12.10.0, TS 5.9 ESM NodeNext, Vitest 4 for
  package tests, ESLint 9/Prettier 3, GitHub Packages registry.

## Commands

Unchanged root contract (`pnpm install`, `pnpm test`, `pnpm run check`,
`pnpm run verify:packages`). Package test suite extended:

```bash
pnpm --filter @experiencequality/test run test        # unit + integration incl. playwright fixtures
pnpm run test:e2e                                     # apps/backend-e2e (vitest) — unchanged
```

A new private consumer app proves the Playwright facade end-to-end:

```bash
pnpm --filter @experiencequality/showcase-browser-e2e run test   # playwright test
```

## Project Structure

```text
packages/test-browser/
├── src/
│   ├── index.ts           # re-exports test, expect, types
│   ├── config.ts          # defineConfig wrapper + XQ defaults
│   ├── test.ts            # test.extend kit fixture
│   ├── global-setup.ts    # pactum mock + backend + db lifecycle
│   ├── context.ts         # env encode/decode of kit payload
│   └── run-context.ts     # TestInfo -> RunContext adapter (decided: lives here)
├── test/                  # vitest unit/integration tests
├── package.json
├── tsconfig.json
└── README.md
apps/
└── browser-e2e/           # private consumer app proving the facade
```

`packages/test-browser/package.json` shape (mirrors `packages/test`):

```json
{
  "name": "@experiencequality/test-browser",
  "exports": {
    ".":        "./dist/index.js",
    "./config": "./dist/config.js",
    "./package.json": "./package.json"
  },
  "dependencies": {
    "@experiencequality/core": "workspace:*",
    "@experiencequality/db": "workspace:*",
    "@experiencequality/rest-client": "workspace:*",
    "@experiencequality/stub": "workspace:*",
    "pactum": "^3.9.1",
    "tsx": "^4.23.15"
  },
  "peerDependencies": {
    "@playwright/test": ">=1.64 <2"
  },
  "publishConfig": { "registry": "https://npm.pkg.github.com" }
}
```

Version: aligned with the other five (`1.0.3` at authoring time) per the release
policy's exact-aligned-version rule — decided.

## Code Style

Same as SPEC.md (strict ESM TS, `.js` extensions, `import type`, kebab-case files,
explicit exports map, single quotes / trailing commas / 100-col).

## Design

### Config subpath

```ts
// consumer playwright.config.ts imports from '@experiencequality/test-browser/config'
export function defineConfig(options: PlaywrightKitConfig = {}) {
  const { application, databases, mock, ...playwrightConfig } = options;
  // XQ defaults merged with consumer overrides:
  //   fullyParallel: true, retries: 0,
  //   reporter: single-file HTML (verify exact option name — likely
  //   ['html', { outputFile: 'playwright-report.html', open: 'never' }]),
  //   screenshot/trace/video retain-on-failure
  // globalSetup resolved to packaged global-setup.js;
  // kit options embedded via env for the setup process.
}
```

### Global setup / context passing

Vitest provides via `project.provide` + `inject()`. Playwright globalSetup runs in a
separate process; workers only receive `process.env`. The kit payload
(`mock.baseUrl`, `backendUrl`, `databases`, run namespace seed) is serialized to
`XQ_TEST_KIT` (name TBD) env var by globalSetup; `context.ts` encodes/decodes it.
Worker processes also must see it — verify Playwright propagates env set in
globalSetup to workers (documented behavior since env is read at worker spawn).

### Test subpath

```ts
// '@experiencequality/test-browser' entry point
export const test = base.extend<KitFixtures, KitWorkerFixtures>({
  kitDatabases: [async ({}, use) => { /* createDatabaseClients(envCtx.databases) */ }, { scope: 'worker' }],
  kit: async ({ context, page, kitDatabases }, use, testInfo) => {
    // run = createRunContext(testInfo, envCtx)
    // kit = { ...createKit(run), db: kitDatabases }
    // after use: stub.clearInteractions() with same dual-error handling as vitest/test.ts
  },
});
```

`createRunContext` currently takes a Vitest `task`; a `TestInfo` → `RunContext`
adapter lives inside `packages/test-browser/src/run-context.ts` (decided — no core
change unless inspection proves the coupling is too tight to adapt externally).

Consumer-side usage target:

```ts
// playwright.config.ts
import { defineConfig } from '@experiencequality/test-browser/config';
export default defineConfig({
  application: { command: 'npm run preview:test', url: 'http://127.0.0.1:4173/' },
  mock: {},
  testDir: './tests/browser',
  projects: [/* consumer matrix */],
});

// tests/browser/foo.spec.ts
import { test, expect } from '@experiencequality/test-browser';
test('flow', async ({ kit, page }) => { /* kit.stub, kit.db, kit.rest */ });
```

### Mapping Playwright webServer vs kit backend

Playwright has native `webServer`; kit has `startBackend`. Keep ONE lifecycle owner:
kit `application` option drives `startBackend` inside globalSetup (parity with Vitest).
Consumer `webServer` blocks are passed through for cases where they still want
Playwright-native serving (e.g. static preview of the frontend itself).

## Testing Strategy

- Unit tests in `packages/test-browser/test/` for `defineConfig` merge behavior and
  `context.ts` encode/decode.
- Integration tests mirroring existing vitest facade integration coverage
  (kit fixture wiring, stub lifecycle, cleanup error aggregation).
- `apps/browser-e2e` private workspace: minimal static page + Playwright spec using the
  facade end-to-end; run via root `test:e2e` variant. Requires `playwright install
  chromium` — CI browser install step approved.
- `verify:structure` extended only if it enumerates allowed subpath exports — check.
- `verify:packages` must still prove packed consumer install works with new exports.

## Boundaries

Same as SPEC.md, plus:

### Always do

- Keep `@playwright/test` a peer dependency; consumers pin their own version.
- Mirror vitest facade semantics where Playwright allows it (fixture naming, cleanup
  error aggregation, option names).
- Keep the new package on the same aligned version and release policy as the other five.

### Ask first

- Any addition of shipped project/viewport presets — currently ruled out; `projects`
  stays consumer-owned.

### Never do

- Change existing packages' public contracts (`./vitest`, `./cucumber`, core/db/
  rest-client/stub exports) unless required by the run-context question.
- Vendor Playwright or browser binaries.

## Success Criteria

1. Consumer `playwright.config.ts` reduces to kit `defineConfig` + testDir/projects.
2. Spec importing `test`/`expect` from `@experiencequality/test-browser` gets `kit`
   fixture with working `stub`, `db`, REST client, and run context — parity with Vitest.
3. `pnpm test`, `pnpm run check`, `pnpm run verify:packages`, and the new browser-e2e
   suite pass from root.
4. Packed-archive consumer install proves `.` and `./config` exports resolve.
5. Vitest and cucumber suites still pass unchanged.
6. `verify:structure` accepts `packages/test-browser` through workspace discovery and
   enforces its manifest policy like the other five.

## Decisions (approved 2026-10-18)

1. All published packages stay version-aligned → `test-browser` starts at the current
   aligned version.
2. Peer range `@playwright/test >=1.64 <2` confirmed.
3. Org viewport/device matrix is consumer choice, not package enforcement — package
   ships no `projects` presets.
4. Enforced defaults locked: reporter = single-file HTML, `retries: 0`,
   `fullyParallel: true`.
5. CI browser install (`playwright install chromium`) approved for `apps/browser-e2e`.
6. `TestInfo` → `RunContext` adapter lives inside `packages/test-browser`, not core.

## Open Questions

None outstanding.
