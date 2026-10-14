# Tasks: Node.js Monorepo Restructure

## Status

Approved on 2026-10-14. Tasks 1–17 are complete; Checkpoint 3 approved on 2026-10-15.

## Task 1: Freeze pnpm root contract

**Description:** Establish pinned pnpm workspace metadata, replacement lockfile, and canonical root
commands while retaining current workspace paths for this slice.

**Acceptance criteria:**

- [x] Root pins `pnpm@12.10.0`; `pnpm-workspace.yaml` includes current package/showcase paths.
- [x] `pnpm-lock.yaml` replaces `package-lock.json` and frozen installation succeeds.
- [x] Root scripts use pnpm and preserve current command names and behavior; matching temporary
  root workspace globs remain until the Task-8 structure gate rewrite.

**Verification:**

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm run build` (including lint, format, and recursive package checks)
- [x] `pnpm test`

**Evidence:** The focused test-package check, build, lint, formatting, recursive checks, and all
five package suites pass under pnpm. The legacy structure verifier still rejects the newly approved
direct `@experiencequality/rest-client` dependency; Task 8 owns its dynamic topology rewrite.

**Dependencies:** None

**Files likely touched:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, removed
`package-lock.json`

**Estimated scope:** Medium

## Parallel Wave 1: Run Tasks 2–5 together after Task 1

## Task 2: Enforce workspace dependency release contract

**Description:** Convert internal dependencies to `workspace:*` and adapt release validation to
source workspace ranges while retaining exact packed versions.

**Acceptance criteria:**

- [x] `core` and `test` resolve internal packages only from workspace.
- [x] Release validation rejects mismatched versions and unsupported internal ranges.
- [x] Focused pack inspection proves exact `1.0.3` dependencies in produced manifests.

**Verification:**

- [x] `node --test scripts/verify-release-version.test.mjs`
- [x] `node scripts/verify-release-version.mjs --version 1.0.3`

**Dependencies:** Task 1

**Files likely touched:** `packages/core/package.json`, `packages/test/package.json`,
`scripts/verify-release-version.mjs`, `scripts/verify-release-version.test.mjs`

**Estimated scope:** Medium

## Task 3: Convert package archive verification

**Description:** Make archive creation and fresh-consumer installation use pnpm while preserving
all public-entrypoint, type-check, Vitest, and Cucumber assertions.

**Acceptance criteria:**

- [x] All five packages are packed through pnpm into an isolated artifact directory.
- [x] Fresh consumer installs only archives and declared peers through pnpm.
- [x] Existing positive and negative public-export checks remain intact.

**Verification:**

- [x] `pnpm run verify:packages`

**Dependencies:** Task 1

**Files likely touched:** `scripts/verify-packages.mjs`

**Estimated scope:** Small

## Task 4: Convert publication automation

**Description:** Use pnpm for registry lookup and publication without changing idempotent planning,
dependency order, registry override, or errors.

**Acceptance criteria:**

- [x] Exact published versions are skipped and missing versions publish in dependency order.
- [x] Registry lookup distinguishes missing packages from authentication/network failures.
- [x] Publication targets only selected workspace package through pnpm.

**Verification:**

- [x] `node --test scripts/publish-packages.test.mjs`

**Dependencies:** Task 1

**Files likely touched:** `scripts/publish-packages.mjs`, `scripts/publish-packages.test.mjs`

**Estimated scope:** Small

## Task 5: Convert aggregate CI runner

**Description:** Replace repository npm invocations with pnpm while retaining current Docker
startup, validation, failure propagation, and cleanup behavior.

**Acceptance criteria:**

- [x] Aggregate checks call canonical pnpm root commands.
- [x] Docker Compose cleanup still runs after success and failure.
- [x] Current showcase path remains until Task 7 owns relocation.

**Verification:**

- [x] Static command-path review of `scripts/ci-test.mjs`
- [ ] `pnpm run check` (blocked only by the legacy verifier's pre-Task-8 dependency boundary)

**Dependencies:** Task 1

**Files likely touched:** `scripts/ci-test.mjs`

**Estimated scope:** Small

## Task 6: Integrate pnpm foundation wave

**Description:** Merge Tasks 2–5 onto Task 1, reconcile contract interactions, and produce
Checkpoint 1 evidence. No feature work belongs here.

**Acceptance criteria:**

- [x] All four slices merge without violating exclusive file ownership.
- [x] Packed manifests contain exact internal versions and publication-plan tests pass.
- [x] No repository-owned script uses npm workspace orchestration.

**Verification:**

- [x] `pnpm install --frozen-lockfile && pnpm run check && pnpm test`
- [x] `node --test scripts/verify-release-version.test.mjs scripts/publish-packages.test.mjs`
- [x] `pnpm run verify:packages`

**Wave evidence:** Frozen install, release/publication tests, five-archive fresh-consumer checks,
full package tests, build, lint, formatting, recursive checks, and the aggregate root check pass.

**Dependencies:** Tasks 2, 3, 4, and 5

**Files likely touched:** None planned; integration fixes return to owner

**Estimated scope:** Small verification session

## Checkpoint 1: pnpm foundation

- [x] All Task 6 verification passes.
- [x] Root commands and package/release behavior match approved specification.
- [x] Human approves layout work.

## Task 7: Move private application and freeze final paths

**Description:** Move `showcase/backend-e2e` intact to `apps/backend-e2e`, switch workspace
membership and active script paths, and remove empty Kafka placeholder.

**Acceptance criteria:**

- [x] Application package name, privacy, files, and behavior are unchanged at new path.
- [x] Workspace, aggregate CI runner, and temporary structure validator use final path.
- [x] No active `showcase/` tree or `packages/kafka-test-server` remains.

**Verification:**

- [x] `pnpm --filter @experiencequality/showcase-backend-e2e run check`
- [x] `docker compose -f apps/backend-e2e/docker-compose.yml config`
- [x] `pnpm run verify:structure`

**Dependencies:** Task 6 and Checkpoint 1 approval

**Files likely touched:** moved application tree, `pnpm-workspace.yaml`, `scripts/ci-test.mjs`,
`scripts/verify-structure.mjs`

**Estimated scope:** Medium; mechanical tree move plus three path edits

## Checkpoint 2: final layout contract

- [x] pnpm reports five libraries and one private application.
- [x] Application checks pass from `apps/backend-e2e`.
- [x] Human approves repository-surface parallel work.

## Parallel Wave 3: Run Tasks 8–11 together after Task 7

## Task 8: Discover and validate pnpm topology

**Description:** Replace hard-coded package membership with pnpm discovery and add focused policy
tests for workspace classes, dependency edges, lockfiles, cycles, and source boundaries.

**Acceptance criteria:**

- [x] Validator discovers all six child workspaces through pnpm.
- [x] Validator rejects wrong privacy/registry policy, forbidden edges, extra lockfiles, and source
  boundary violations.
- [x] Workspace cycles fail through pnpm policy and temporary root workspace globs are removed.

**Verification:**

- [x] `node --test scripts/verify-structure.test.mjs`
- [x] `pnpm run verify:structure`

**Dependencies:** Task 7

**Files likely touched:** `scripts/verify-structure.mjs`, `scripts/verify-structure.test.mjs`,
`package.json`

**Estimated scope:** Small

## Task 9: Define shared test-tool contracts

**Description:** Add root test TypeScript policy and named Vitest project definitions consumed by
later package migrations. Do not edit package configs in this task.

**Acceptance criteria:**

- [x] Shared test compiler policy owns no-emit and declaration settings.
- [x] Root Vitest config defines stable names and explicit includes for four simple libraries.
- [x] Unique facade/database/application configs remain outside root projects.

**Verification:**

- [ ] TypeScript configuration parses for representative leaf and dependent packages.
- [x] `pnpm exec vitest list --config vitest.config.ts` lists intended simple-library tests.

**Dependencies:** Task 7

**Files likely touched:** `tsconfig.test.base.json`, `vitest.config.ts`

**Estimated scope:** Small

## Task 10: Convert GitHub Actions to pnpm

**Description:** Install pinned pnpm, enable pnpm caching, use frozen installs, and invoke approved
root pnpm commands without changing workflow triggers, matrices, permissions, or release gates.

**Acceptance criteria:**

- [x] Every Node job installs pnpm before dependency-cache setup.
- [x] Build, test, release, and publish jobs use frozen pnpm installs and root commands.
- [x] No workflow uses npm for repository workspace operations.

**Verification:**

- [x] Workflow YAML parses (static workflow assertions passed; `actionlint` unavailable).
- [x] `rg -n "npm (ci|run|test|publish|pack)" .github/workflows` returns no repository-operation
  matches.

**Dependencies:** Task 7

**Files likely touched:** `.github/workflows/build.yml`, `.github/workflows/test.yml`,
`.github/workflows/deploy.yml`, `.github/workflows/publish.yml`

**Estimated scope:** Medium

## Task 11: Update primary repository documentation

**Description:** Update quick-start, development, API, release, and deliverables documentation to
approved pnpm commands and `apps/` layout.

**Acceptance criteria:**

- [x] Maintainer command blocks use existing pnpm root scripts.
- [x] Layout and release text references final paths and lockfile.
- [x] Public behavior, versions, registry, and release policy remain unchanged.

**Verification:**

- [x] Command/path search across owned documents returns no stale repository command or path.

**Dependencies:** Task 7

**Files likely touched:** `README.md`, `docs/development.md`, `docs/api.md`,
`docs/release-policy.md`, `docs/deliverables.md`

**Estimated scope:** Medium

## Parallel Wave 4: Run Tasks 12–16 after Task 9; use at most four slots

## Task 12: Adopt shared TypeScript policy in leaf packages

**Description:** Reduce `db`, `rest-client`, and `stub` test configs to package paths and unique
includes by extending Task 9's shared base.

**Acceptance criteria:**

- [x] All three leaf packages retain strict no-emit test checking.
- [x] Existing test and config includes remain unchanged.
- [x] No generated test output appears.

**Verification:**

- [x] Focused `check` scripts pass for all three packages.

**Dependencies:** Task 9

**Files likely touched:** three leaf `tsconfig.test.json` files

**Estimated scope:** Medium

## Task 13: Adopt shared TypeScript policy in dependent packages

**Description:** Move `core` and `test` test configs onto shared policy while preserving reference
isolation and facade-specific includes.

**Acceptance criteria:**

- [x] Both packages retain no-emit checks without build references.
- [x] Facade unit, integration, and configuration sources remain included.
- [x] Full TypeScript build graph remains unchanged.

**Verification:**

- [x] Focused `check` scripts pass for `core` and `test`.
- [x] `pnpm run build`

**Dependencies:** Task 9

**Files likely touched:** `packages/core/tsconfig.test.json`, `packages/test/tsconfig.test.json`

**Estimated scope:** Small

## Task 14: Move core and REST tests to root Vitest projects

**Description:** Point focused scripts at Task 9's named projects and remove duplicated local
Vitest configs for `core` and `rest-client`.

**Acceptance criteria:**

- [x] Focused scripts select same test files as before.
- [x] Root project names are stable and package-specific.
- [x] Removed configs contain no unique behavior.

**Verification:**

- [x] `pnpm --filter @experiencequality/core test`
- [x] `pnpm --filter @experiencequality/rest-client test`

**Dependencies:** Task 9

**Files likely touched:** two package manifests and two removed Vitest configs

**Estimated scope:** Medium

## Task 15: Move DB and stub tests to root Vitest projects

**Description:** Point focused scripts at Task 9's named projects and remove duplicated local
Vitest configs for `db` and `stub`.

**Acceptance criteria:**

- [x] Focused scripts select same test files as before.
- [x] Database unit tests remain separate from facade database lifecycle configuration.
- [x] Removed configs contain no unique behavior.

**Verification:**

- [x] `pnpm --filter @experiencequality/db test`
- [x] `pnpm --filter @experiencequality/stub test`

**Dependencies:** Task 9

**Files likely touched:** two package manifests and two removed Vitest configs

**Estimated scope:** Medium

## Task 16: Update consumer and remaining documentation

**Description:** Update private application instructions, consumer examples, and remaining
maintained path references while leaving unrelated intent documents untouched.

**Acceptance criteria:**

- [x] Application README works from final path with pnpm commands.
- [x] Consumer guide defaults to pnpm without claiming packages require pnpm.
- [x] No owned document references obsolete paths or repository npm commands.

**Verification:**

- [ ] Path/command search across owned documents returns no stale matches.
- [ ] `git status --short docs/intent` shows only pre-existing user-owned files.

**Dependencies:** Tasks 7 and 9

**Files likely touched:** `docs/consumer-guide.md`, `docs/agent-workplan.md`,
`docs/vitest-poc-walkthrough.html`, `apps/backend-e2e/README.md`

**Estimated scope:** Medium

## Task 17: Integrate repository-surface waves

**Description:** Merge Tasks 8 and 10–16, reconcile their use of Task 9 contracts, and run every
approved acceptance check. No new scope belongs here.

**Acceptance criteria:**

- [x] All parallel slices merge while satisfying every slice's acceptance criteria.
- [x] Exactly six child workspaces, one lockfile, and approved config ownership remain.
- [x] Public exports, versions, engines, registry, CI, and release behavior are preserved.

**Verification:**

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm run check && pnpm test && pnpm run ci:test`
- [x] `pnpm run verify:packages`
- [x] `git diff --check`
- [x] Global stale-path and npm-workspace-command search returns no actionable matches; historical
  references remain only in the specification/task records and the separate skill guide.

**Dependencies:** Tasks 8–16

**Files likely touched:** None planned; integration fixes return to owner

**Estimated scope:** Small verification session

## Checkpoint 3: complete

- [x] All specification success criteria have evidence.
- [x] No unrelated user changes were modified.
- [x] Final diff and verification results are ready for human review.
- [x] Human approved Checkpoint 3 on 2026-10-15.
