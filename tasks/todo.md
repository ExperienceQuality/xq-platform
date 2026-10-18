<!-- ALL TASKS COMPLETE 2026-10-18: T1-T10 landed; all root gates green -->

# Tasks: @experiencequality/test-browser

Implements `tasks/plan.md` + `SPEC-playwright.md`. Waves mark safe parallelism;
file ownership is exclusive per task within a wave.

## T1: Scaffold `packages/test-browser` package skeleton — DONE

**Wave 0 — contract; everything depends on this.** (complete: package scaffolded,
tsconfig/vitest/root wiring done, `verify:structure` generalized to N apps, full root
`check` + `test` green 2026-10-18)

Create the publishable package skeleton so parallel slices have fixed paths, names, and
compiler/test config.

**Acceptance criteria:**

- [ ] `packages/test-browser/{src,test}/` exists with placeholder `src/index.ts`,
  `package.json`, `tsconfig.json`, `README.md`
- [ ] `package.json` mirrors `packages/test`: name `@experiencequality/test-browser`,
  version `1.0.3`, `type: module`, exports `.` + `./config` + `./package.json`,
  `publishConfig` GitHub Packages, `engines.node >=24`, `files` dist+README+package.json
- [ ] deps: `@experiencequality/{core,db,rest-client,stub}` `workspace:*`, `pactum`,
  `tsx`; peerDeps `@playwright/test >=1.64 <2`; `@playwright/test` also as devDep for
  local test/build
- [ ] `tsconfig.json` extends root base, references workspace deps like other packages
- [ ] Root `tsconfig.json` project references include `packages/test-browser`;
  root `test` script filter list includes `@experiencequality/test-browser`
- [ ] `pnpm install` resolves; `pnpm run build` and
  `pnpm --filter @experiencequality/test-browser run check` pass
- [ ] `pnpm run verify:structure` accepts the new workspace

**Verification:** `pnpm install --frozen-lockfile || pnpm install`, `pnpm run build`,
`pnpm run verify:structure`

**Files touched:** `packages/test-browser/**`, root `package.json` (test filter),
root `tsconfig.json`, `pnpm-lock.yaml`

**Estimated scope:** M

---

## T2: `src/context.ts` — kit payload env codec

**Wave A — parallel with T3, T4.**

Encode/decode the kit payload that `config.ts` writes and `global-setup.ts`/workers read.

**Acceptance criteria:**

- [ ] `encodeKitOptions(options: KitOptions): string` / `decodeKitOptions(raw): KitOptions`
- [ ] `encodeKitPayload(payload): string` / `decodeKitPayload(raw): KitPayload` for the
  runtime payload `{mock:{baseUrl,host,port,managementUrl,namespaceHeader}, backendUrl,
  databases}` — same shape vitest global-setup `provide()`s
- [ ] Env var names exported as constants: `NODE_TEST_KIT_OPTIONS` (config→setup) and
  `NODE_TEST_KIT` (setup→workers, reuse existing `NODE_TEST_KIT_*` env names where
  `createRunContext` already reads them: `NODE_TEST_KIT_BACKEND_URL`,
  `NODE_TEST_KIT_STUB_URL`)
- [ ] Round-trip unit tests incl. empty options and unicode

**Verification:** `pnpm --filter @experiencequality/test-browser run test -- context`

**Files touched:** `packages/test-browser/src/context.ts`,
`packages/test-browser/test/context.test.ts`

**Estimated scope:** S

---

## T3: `src/run-context.ts` — `TestInfo` → `RunContext` adapter

**Wave A — parallel with T2, T4.**

Adapt Playwright `TestInfo` to `createRunContext`'s duck-typed `{id}` input.

**Acceptance criteria:**

- [ ] `runContextForTestInfo(testInfo, metadata)` returns `RunContext` via
  `createRunContext({ id: testInfo.testId }, metadata)`
- [ ] `workerId` resolves from `testInfo.workerIndex` without touching core — adapter
  may set the env var `createRunContext` reads, or pass through metadata if core's
  `RunMetadata` gains no field (decision at implementation, no core API change)
- [ ] Unit tests with a mocked `TestInfo` shape (no real browser needed)

**Verification:** `pnpm --filter @experiencequality/test-browser run test -- run-context`

**Files touched:** `packages/test-browser/src/run-context.ts`,
`packages/test-browser/test/run-context.test.ts`

**Estimated scope:** S

---

## T4: `src/config.ts` — `defineConfig` wrapper + XQ defaults

**Wave A — parallel with T2, T3.**

Wrap `@playwright/test`'s `defineConfig`; merge XQ defaults, embed kit options into
`NODE_TEST_KIT_OPTIONS` env for global setup, and point `globalSetup` at the packaged
`global-setup.js` (same `import.meta.url` resolution trick as `vitest/config.ts`).

**Acceptance criteria:**

- [ ] `defineConfig(options: BrowserKitConfig = {}): PlaywrightConfig`
- [ ] `BrowserKitConfig` = Playwright `PlaywrightTestConfig` + `KitOptions`
  (`application`, `databases`, `mock`) — kit keys stripped before passing to
  Playwright's `defineConfig`
- [ ] Defaults applied: `fullyParallel: true`, `retries: 0`, single-file HTML reporter
  (verify option at impl), `screenshot/trace/video` retain-on-failure
- [ ] Consumer overrides win for Playwright keys (`use`, `projects`, `testDir`,
  `webServer`, reporter list additions)
- [ ] `globalSetup` = packaged setup module + consumer `globalSetup` appended
- [ ] Unit tests assert merge order and env embedding (import `context.ts` codec — the
  T2 contract; if T2 lands later, inline the constant and reconcile)

**Verification:** `pnpm --filter @experiencequality/test-browser run test -- config`

**Files touched:** `packages/test-browser/src/config.ts`,
`packages/test-browser/test/config.test.ts`; **may read** `context.ts` (T2 contract)

**Estimated scope:** M

---

## T5: `src/global-setup.ts` — mock + backend lifecycle

**Wave B — parallel with T6. Depends on T2 env format.**

Spike-check env propagation first (see Verification), then port
`packages/test/src/vitest/global-setup.ts` to Playwright's `FullConfig` signature.

**Acceptance criteria:**

- [ ] Exported setup fn reads `NODE_TEST_KIT_OPTIONS`, starts `startPactumServer(options.mock)`,
  then `startBackend` when `application.command` set (same env injection
  `NODE_TEST_KIT_STUB_URL`), stops both on teardown — same failure-cleanup order as
  vitest version
- [ ] Kit payload written so worker processes can read it (env documented to propagate;
  if Playwright does not propagate, switch to temp-file path under `outputDir` — flag
  in PR)
- [ ] Consumer `application.url` passthrough honored (`backendUrl` may be null)
- [ ] Integration test: fake `FullConfig` + real pactum server start/stop

**Verification:** spike — minimal playwright run with globalSetup setting an env var,
spec asserting worker sees it; then
`pnpm --filter @experiencequality/test-browser run test -- global-setup`

**Files touched:** `packages/test-browser/src/global-setup.ts`,
`packages/test-browser/test/global-setup.test.ts`

**Estimated scope:** M

---

## T6: `src/test.ts` — `kit` fixture + `index.ts`

**Wave B — parallel with T5. Depends on T2 (payload decode), T3 (adapter).**

Port `packages/test/src/vitest/test.ts` to `test.extend` fixtures.

**Acceptance criteria:**

- [ ] Worker-scoped `kitDatabases` fixture creates/destroys `DatabaseClients` from the
  decoded payload's `databases`
- [ ] Test-scoped `kit` fixture: `Object.freeze({ ...createKit(run), db })` with the
  same test-error + `stub.clearInteractions()` `AggregateError` handling as vitest
- [ ] `index.ts` exports `test`, `expect`, `NodeTestKit` type — Playwright `expect`
  re-export
- [ ] Fixture unit test via `test.info()`-style invocation or a real one-spec
  playwright run inside the package's own test (pick cheaper)

**Verification:** `pnpm --filter @experiencequality/test-browser run test`

**Files touched:** `packages/test-browser/src/test.ts`,
`packages/test-browser/src/index.ts`, `packages/test-browser/test/fixture.test.ts`

**Estimated scope:** M

---

## T7: Package test suite green

**Wave C — parallel with T8. Depends on T4, T5, T6.**

Make `pnpm --filter @experiencequality/test-browser run test` a real green suite.

**Acceptance criteria:**

- [ ] All unit/integration tests from T2–T6 pass under the package's vitest config
  (named root project if `vitest.config.ts` uses projects — match repo convention)
- [ ] `pnpm run check` in the package (typecheck) clean
- [ ] No `.only`, no skipped tests

**Verification:** `pnpm --filter @experiencequality/test-browser run test`,
`pnpm run test` from root includes the package

**Files touched:** `packages/test-browser/test/**`, `vitest.config.ts` (root, if
project registration needed)

**Estimated scope:** S-M

---

## T8: `apps/browser-e2e` private consumer app

**Wave C — parallel with T7. Depends on T4, T5, T6.**

Minimal private workspace proving consumer usage per spec.

**Acceptance criteria:**

- [ ] `apps/browser-e2e/` private package: minimal static page served via
  `application.command` (node http or vite preview — pick smallest)
- [ ] `playwright.config.ts` = kit `defineConfig` + `testDir` + consumer `projects`
- [ ] One `.spec.ts` using `test`/`kit` from `@experiencequality/test-browser`:
  exercises `kit.stub` interaction + a real page assertion
- [ ] Runs locally: `pnpm --filter @experiencequality/showcase-browser-e2e run test`
- [ ] Root script added (e.g. `test:e2e:browser`)

**Verification:** `pnpm --filter @experiencequality/showcase-browser-e2e run test`

**Files touched:** `apps/browser-e2e/**`, root `package.json` (script)

**Estimated scope:** M

---

## T9: CI — Chromium install for browser-e2e

**Wave D. Depends on T8.**

Add browser install to the test workflow only.

**Acceptance criteria:**

- [ ] `.github/workflows/test.yml` (or matching) runs `pnpm exec playwright install
  --with-deps chromium` before the browser-e2e step
- [ ] Browser-e2e job/step uses the root script from T8
- [ ] No change to release/publish workflow semantics

**Verification:** workflow YAML lint + CI run green

**Files touched:** `.github/workflows/*.yml` (test workflow only)

**Estimated scope:** S

---

## T10: Root wiring, verify gates, docs

**Wave D — last. Depends on all.**

- [ ] `pnpm run check`, `pnpm test`, `pnpm run verify:structure`,
  `pnpm run verify:packages` all green — packed consumer resolves `.` + `./config`
- [ ] `docs/api.md`, `docs/consumer-guide.md`, `docs/development.md`, `README.md`
  updated for the sixth package (usage sample per spec)
- [ ] `pnpm run format` clean

**Verification:** full root gate suite

**Files touched:** root docs + scripts as needed

**Estimated scope:** M

---

## Checkpoints

- **After T1:** scaffold builds; structure gate green — go/no-go for parallel waves.
- **After wave B (T5, T6):** env-propagation spike result confirmed before T8 builds
  on it.
- **After T10:** all spec success criteria have evidence; diff ready for review.
