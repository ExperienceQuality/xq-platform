# Agent Workplan

Engineering Manager owns requirements, priority, scope, and acceptance.

## Locked decisions

- GitHub Pages shows latest successful report only.
- `main` is source of truth. Pages publishes from `main`; release tags are cut from `main`.
- `reportPath` is a consumer-relative path.
- Namespace header contract becomes standardized across Vitest, Cucumber, REST, stub, showcase, docs, and tests.
- Failed runs upload a workflow artifact for diagnosis but do not replace the last successful GitHub Pages report.

## Shared report contract

- Supported helper: `defineCucumberConfig`.
- Default path: `artifacts/index.html`.
- Blank or missing `reportPath`: default path.
- Nonblank `reportPath`: relative to consumer working directory.
- HTML report remains mandatory; `progress` remains CI console output.
- Path must stay inside the consumer workspace. Absolute and traversal paths require validation and rejection.

## Parallel work items

Each item has disjoint primary files. Agents must not edit another item's primary files.

### Wave 1 — independent contracts

#### RPT-01 — Report runtime acceptance

Owner: Testing Specialist + Node.js Engineer

Files:

- `packages/test/test/integration/cucumber-cli.test.ts`
- `packages/test/test/fixtures/cucumber-consumer/**`

Work:

- Prove default HTML report creation.
- Prove custom relative path creation.
- Prove blank path fallback.
- Prove failed scenario still writes report and preserves non-zero exit.
- Assert report is non-empty and contains feature/scenario status.

Acceptance:

```gherkin
Given a fresh consumer uses defineCucumberConfig
When Cucumber runs a scenario
Then the configured HTML report exists relative to the consumer directory
And the report contains the scenario result
```

#### RPT-02 — Report path validation

Owner: Node.js Engineer

Files:

- `packages/test/src/cucumber/config.ts`
- `packages/test/src/cucumber/types.ts`
- `packages/test/test/unit/cucumber-config.test.ts`

Work:

- Enforce consumer-relative paths.
- Reject absolute paths.
- Reject `..` traversal outside consumer workspace.
- Preserve blank fallback.
- Decide and test nested relative directories.

Acceptance:

```gherkin
Given reportPath is absolute or escapes consumer workspace
When configuration loads
Then configuration fails with an xq-test error
```

#### DB-01 — Database URL contract

Owner: Node.js Engineer

Files:

- `packages/db/src/database.ts`
- `packages/db/test/database.test.ts`
- `apps/backend-e2e/vitest.config.ts`

Work:

- Resolve descriptor-specific environment variable.
- Define `DATABASE_URL` precedence explicitly.
- Fail clearly when required variable is missing.
- Remove literal URLs passed through `urlEnv`.

Acceptance:

```gherkin
Given orders uses ORDERS_DATABASE_URL
And analytics uses ANALYTICS_DATABASE_URL
When clients are created
Then each client uses its own environment value
```

#### NS-01 — Namespace standardization

Owner: Node.js Engineer + Testing Specialist

Files:

- `packages/test/src/cucumber/world.ts`
- `packages/rest-client/src/**`
- `packages/stub/src/**`
- `packages/test/test/**`

Work:

- Select one canonical header.
- Centralize constant.
- Update Cucumber, REST, stub, and isolation tests.
- Preserve public configurability where already supported.

Acceptance:

```gherkin
Given two scenarios run in parallel
When both call application and downstream stub
Then each sees only its own namespace interactions
```

#### CORE-01 — Backend lifecycle behavior

Owner: Node.js Engineer + Testing Specialist

Files:

- `packages/core/src/backend-process.ts`
- `packages/core/test/**`

Work:

- Await process exit during stop.
- Reap process on readiness timeout.
- Handle early exit and spawn errors.
- Add bounded shutdown escalation if contract requires it.

Acceptance:

```gherkin
Given a backend process is running
When stop is called
Then stop resolves only after child exit
And repeated stop is safe
```

### Wave 2 — CI and release slices

#### CI-01 — Dedicated Cucumber command

Owner: GitHub Actions Specialist + Node.js Engineer

Files:

- `package.json`
- `scripts/verify-cucumber-report.mjs`

Work:

- Add deterministic report-producing command.
- Preserve Cucumber exit status.
- Validate report path, size, HTML marker, and no forbidden secret sentinel.

Depends on: RPT-01, RPT-02.

#### CI-02 — Workflow artifact upload

Owner: GitHub Actions Specialist

Files:

- `.github/workflows/test.yml`

Work:

- Run CI-01.
- Upload report with `if: always()`.
- Upload on success and failure.
- Set artifact name and bounded retention.

Depends on: CI-01.

#### CI-03 — Latest-only GitHub Pages

Owner: GitHub Actions Specialist

Files:

- `.github/workflows/pages.yml`

Work:

- Trigger trusted `main` pushes and manual dispatch.
- Build Pages artifact with report as `index.html`.
- Deploy latest successful report only.
- Serialize deployment with concurrency group.
- Use only `pages: write` and `id-token: write` on deploy job.

Depends on: CI-01, CI-02.

Acceptance:

```gherkin
Given a successful main run
When Pages workflow completes
Then latest report is published at site root as index.html

Given a failed run
When workflow completes
Then report artifact remains available
And last successful Pages deployment remains unchanged
```

#### CI-04 — Release gate alignment

Owner: GitHub Actions Specialist

Files:

- `.github/workflows/deploy.yml`
- `.github/workflows/build.yml`
- `.github/workflows/test.yml`

Work:

- Gate package publication on build, tests, Cucumber, E2E, package verification.
- Ensure exact release ref from `main` is tested.
- Ensure Compose cleanup runs after failure.

Depends on: CI-01, DB-01, CORE-01.

#### CI-05 — Version consistency preflight

Owner: GitHub Actions Specialist

Files:

- `scripts/verify-release-version.mjs`
- `.github/workflows/deploy.yml`

Work:

- Match tag version to all five package versions.
- Match internal dependency versions.
- Fail before publication on mismatch.

Depends on: CI-04.

### Wave 3 — release confidence and docs

#### API-01 — Packed export verification

Owner: Testing Specialist

Files:

- `scripts/verify-packages.mjs`
- `packages/test/test/unit/public-exports.test.ts`

Work:

- Verify `CUCUMBER_REPORT_PATH` from packed package.
- Verify `reportPath` behavior in fresh consumer.
- Verify documented subpaths load.

Depends on: RPT-01, RPT-02.

#### E2E-01 — Showcase payment/database assertions

Owner: Testing Specialist

Files:

- `apps/backend-e2e/test/**`

Work:

- Assert payment response body and persisted row.
- Add invalid-payment scenario.
- Verify namespace forwarding and interaction count.
- Verify test data isolation policy.

Depends on: DB-01, NS-01.

#### DOC-01 — Consumer/operator documentation

Owner: Researcher + Node.js Engineer

Files:

- `docs/consumer-guide.md`
- `docs/development.md`
- `packages/test/README.md`
- `README.md`

Work:

- Document default/custom report path.
- Document CI artifact and latest-only Pages behavior.
- Correct package scope/version examples.
- Document supported helper-level enforcement boundary.

Depends on: RPT-02, CI-03.

#### HARD-01 — Workflow hardening

Owner: GitHub Actions Specialist

Files:

- `.github/workflows/**`

Work:

- Add job timeouts.
- Review action pinning.
- Apply least-privilege permissions.
- Add Pages/report retention policy.
- Verify required branch checks.

Depends on: CI-03, CI-04.

## Manager acceptance gate

Work is complete when:

- All P0 items pass their BDD acceptance.
- `pnpm run check` passes.
- `pnpm test` passes.
- `pnpm run verify:packages` passes.
- `pnpm run ci:test` passes where Docker is available.
- Main-only Pages deployment publishes latest successful report.
- Failed runs retain downloadable report artifacts without replacing Pages.
- Database, namespace, backend lifecycle, and report contracts are documented.
