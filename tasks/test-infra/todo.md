# Task Checklist: @experiencequality/test-infra

**Status:** Approved — 2026-10-24 (maintainer approval). Implements `SPEC-test-infra.md` per `tasks/test-infra/plan.md`.

T1–T14 are implemented, verified, and reviewed below; Checkpoint E approved 2026-10-25 (see `docs/migrations/test-infra-verification.md`). Verification commands marked **future** are targets, not executed evidence; commands marked **executed** link their evidence. No pass result is invented. The full suite is not rerun at every handoff; one final complete gate runs at T14, after which only affected failing checks are rerun following fixes. Task sizes assume 3–5-file slices; if a session expands beyond that, split the task before implementation — no unreviewed handoff larger than 5 files.

## T1 — Capture upstream baseline and provenance

- **Dependencies:** none
- **Files likely touched:** `docs/migrations/test-infra-baseline.md` (1)
- **Size:** M

**Description:** Isolate the pinned source archive (commit `3d74803af7b71c9e946523ac7dd6d6e695cc8f07`) in a temp directory outside the workspace — no git clone required. Copy the original manifest, license, hash, and provenance evidence. Omit the unused private `@chauhaidang/xq-js-common-kit` only in the temporary baseline install manifest, after confirming no runtime references; log this adaptation; never modify upstream. Install the historical runtime + Jest without executing arbitrary package lifecycle scripts (`npm install --ignore-scripts` against the restricted baseline manifest; exact lock if compatible). No Jest is added to the target. Capture full logs, source identities, and representative parsed-compose + nginx fixtures once, normalizing only temporary paths; freeze the evidence so later presentation never reruns the baseline. The test filter excludes Docker Integration tests — no Docker lifecycle; the upstream `beforeAll` may probe `docker --version` (read-only, not a daemon operation). If upstream tests fail, record exact assertions and expected/actual and stop for lead judgment — do not fix production code or skip tests. No shared system data. No runtime writes to the workspace.

**Acceptance:**

- [x] Pinned-source provenance evidence (manifest, license, hash) captured; the baseline adaptation log records the omitted unused private dependency and confirms upstream is unmodified.
- [x] Non-Docker Jest baseline logs and raw generated compose/nginx fixtures frozen (kept raw — normalization deferred to lead review); no failures occurred, so nothing needed escalation.
- [x] `docs/migrations/test-infra-baseline.md` references local evidence paths/checksums and baseline limitations; no raw third-party source or Jest lockfiles committed.

**Verification (executed 2026-10-25):** both commands ran in the isolated upstream dir — exit 0 each (102/102 unit tests, 8 passed + 4 Docker-skipped integration). Evidence: `docs/migrations/test-infra-baseline.md`, `/tmp/xq-t1-baseline/evidence/jest-unit.log`, `/tmp/xq-t1-baseline/evidence/jest-integration-cli.log`.

## T2 — Establish typed/compiler/test contract

- **Dependencies:** T1
- **Files likely touched:** `packages/test-infra/src/types.ts`, `packages/test-infra/tsconfig.json`, `packages/test-infra/tsconfig.test.json`, `packages/test-infra/vitest.config.ts` (4)
- **Size:** M

**Description:** Define the typed models matching observed fields — service spec (routing, global deps, ports), Compose objects (including conditional `depends_on`), generator options, command result/error details, test-container status — with no broad `any`. `tsconfig.json` per spec (extends `../../tsconfig.base.json`; `composite`, `rootDir: src`, `outDir: dist`, `tsBuildInfoFile: .tsbuildinfo`; includes `src/**/*.ts`). `tsconfig.test.json` extends `../../tsconfig.test.base.json`, includes src/test/config, `noEmit: true`. `vitest.config.ts`: node environment, `test/**/*.test.ts`, fork pool, `fileParallelism: false`. Any dependencies the types need wait for T3.

**Acceptance:**

- [x] Typed models cover all observed fields; external-input boundaries are `unknown`, narrowed before use; no blanket `any`.
- [x] All three configs match the spec exactly (composite build config, `noEmit` test config, package-local Vitest config).
- [x] No placeholder tests exist and no zero-test pass is claimed.

**Verification (executed):** `pnpm exec tsc -b packages/test-infra` → exit 0 (emitted `dist/types.*`); `pnpm exec eslint packages/test-infra` → exit 0.

## T3 — Register package and install dependencies

- **Dependencies:** T2
- **Files likely touched:** `packages/test-infra/package.json`, `packages/test-infra/README.md`, `packages/test-infra/LICENSE`, `packages/test-infra/UPSTREAM.md`, `pnpm-lock.yaml` (5)
- **Size:** M

**Description:** Author the ESM manifest with the aligned version, repository directory, company registry, bin target `dist/bin/xq-infra.js`, `files`, and build/check/test scripts per spec; the six dependency ranges; package-local `@types` for dependencies missing types; no internal deps and no Jest. Preserve the exact Apache `LICENSE` and `UPSTREAM.md` provenance. `README.md` is minimal and factual about the current slice — not claimed complete.

**Acceptance:**

- [x] Manifest matches spec: `"type": "module"`, bin, files, scripts, six runtime deps + required `@types`, aligned version, company registry.
- [x] `LICENSE`/`UPSTREAM.md` preserve Apache text and pinned provenance exactly.
- [x] Single root `pnpm-lock.yaml` updated; no extra lockfile created.

**Verification (executed):** `pnpm install --ignore-scripts` → exit 0 (11 packages added); `pnpm install --frozen-lockfile --ignore-scripts` → exit 0 ("lockfile is up to date"); `pnpm --filter @experiencequality/test-infra run build` → exit 0; `pnpm --filter @experiencequality/test-infra run check` → exit 0. No CLI smoke until T9 — an interim missing bin is expected and does not mean the package is ready.

### Checkpoint A (after T1–T3)

Review the baseline evidence, the `types.ts` contract, and the manifest/lockfile diff. Confirm the staged inventory-gate failure is documented and no gate was weakened before runtime slices begin.

## T4 — Port directory loader + tests

- **Dependencies:** T2, T3
- **Files likely touched:** `packages/test-infra/src/services/serviceLoader.ts`, `packages/test-infra/test/serviceLoader.test.ts` (2)
- **Size:** M

**Description:** Port the service loader and its tests, preserving all upstream assertions: single/multiple service extension scanning, ordering, naming, global config, and the empty/malformed/duplicate/missing-dependency/cycle behaviors.

**Acceptance:**

- [x] All upstream loader assertions ported to Vitest with explicit `vitest` imports (30/30 pass).
- [x] Scanning, ordering, naming, global-config, and validation-error behaviors are identical.

**Verification (executed 2026-10-25):** `pnpm run test -- test/serviceLoader.test.ts` → exit 0, 30 passed (log: `/tmp/xq-test-infra-evidence/t4-green.log`); expected RED first (missing module, log: `t4-red.log`); `pnpm run check` → exit 0; eslint clean. Note: the `--`-separated file arg does not filter under `vitest run --config` — all suite files ran; use `-t` patterns for real focusing.

## T5 — Port nginx gateway + tests

- **Dependencies:** T2, T3
- **Files likely touched:** `packages/test-infra/src/services/gateway.ts`, `packages/test-infra/test/gateway.test.ts` (2)
- **Size:** M

**Description:** Port the gateway and its tests, preserving upstream methods, path/wildcard ordering, service fallback, ports, and health handling — no route-algorithm fixes. Snapshot/string fixtures come from the frozen upstream baseline.

**Acceptance:**

- [x] All upstream gateway assertions ported to Vitest (23/23 pass).
- [x] Route text output matches the frozen upstream fixtures; no algorithm changes (templates copied verbatim).

**Verification (executed 2026-10-25):** `pnpm run test -- test/gateway.test.ts` → exit 0, 23 passed (log: `/tmp/xq-test-infra-evidence/t5-green.log`; expected RED first in `t5-red.log`); `pnpm run check` → exit 0; `tsc -b` → exit 0; eslint clean.

## T6 — Port compose generation + tests

- **Dependencies:** T4, T5
- **Files likely touched:** `packages/test-infra/src/services/composeGenerator.ts`, `packages/test-infra/test/composeGenerator.test.ts`, plus at most 2 test fixture files if strictly necessary (≤4)
- **Size:** M

**Description:** Port the compose generator and tests. Preserve single-file and directory loading, shallow override semantics, ports, dependencies, gateway health conditions, and file keep/cleanup behavior; compare against the normalized frozen baseline output. Tests use private temp working directories only and restore cwd/listeners.

**Acceptance:**

- [x] All upstream generator assertions ported (19 tests), including single-file, directory, and override paths; plus 2 frozen-equivalence and 1 new `service_healthy`-condition test (22 total).
- [x] Parsed output is equivalent to the frozen baseline with only the `xq-gateway` nginx.conf volume path normalized (frozen fixtures embedded verbatim in `test/baseline-fixtures.ts`; nginx conf compared byte-exact).
- [x] Every test cleans up its own temp cwd (`fs.mkdtemp` + `process.chdir`, restored in `afterEach`) and restores process state; loader/gateway `Date.now()` temp dirs replaced with `fs.mkdtemp` (`xq-serviceloader-test-`/`xq-gateway-test-`).

**Verification (executed 2026-10-25):** expected RED first (`/tmp/xq-test-infra-evidence/t6-red.log`, module-not-found), then `pnpm --filter @experiencequality/test-infra exec vitest run --config vitest.config.ts test/composeGenerator.test.ts` → 22 passed (`t6-green.log`); loader/gateway rerun after mkdtemp fix → 53/53 (`t6-loader-gateway-rerun.log`); `run check` → exit 0; `tsc -b` → exit 0; eslint on touched files → exit 0; whitespace clean.

### Checkpoint B (after T4–T6)

Review the loader/gateway/generator slices against the frozen baseline evidence. Confirm `types.ts` stayed frozen, mocks/cleanup are in place, and no shared-file edits leaked in.

## T7a — Port Compose spawn/detection and command semantics + tests

- **Dependencies:** T2, T3
- **Files likely touched:** `packages/test-infra/src/services/composeInvoker.ts`, `packages/test-infra/test/composeInvoker.test.ts` (2; serial ownership with T7b)
- **Size:** M

**Description:** Port the invoker's spawn layer and command semantics. `vi.mock` `cross-spawn`/`which` with ESM-appropriate hoisted factories; typed child-process emitters. Cover Compose v2/v1 detection, error codes, stdout/stderr, `error.result`, timeout signal behavior, and argv/env/cwd for up/down/pull/logs including no-pull. Assert no real spawn escapes the mocks **within this mock suite** — T9's compiled-bin subprocess tests are intentionally separate. Restore env/timers/listeners after each test.

**Acceptance:**

- [x] Invocation assertions ported: argv/env/cwd for up/down/pull (+ps/logs ported in source), no-pull, and v2/v1 detection/caching (17 tests under `-t 'Compose invocation'`).
- [x] Error codes, stdout/stderr, `error.result`, and timeout SIGTERM behavior covered (fake timers in execCommand tests).
- [x] No real process spawn escapes the mocks in this suite (`vi.mock` factories on `cross-spawn`/`which` default CJS shape); per-test listener snapshot removes only newly added SIGINT/SIGTERM/exit listeners; timers restored.

**Verification (executed 2026-10-25):** expected RED (`/tmp/xq-test-infra-evidence/t7a-red.log`), then `pnpm --filter @experiencequality/test-infra exec vitest run --config vitest.config.ts test/composeInvoker.test.ts -t 'Compose invocation'` → 17 passed (`t7a-green.log`); package `check` → exit 0; `tsc -b` → exit 0; eslint clean.

## T7b — Port test-container classification/polling tests

- **Dependencies:** T7a (serial ownership of the same two files)
- **Files likely touched:** `packages/test-infra/src/services/composeInvoker.ts`, `packages/test-infra/test/composeInvoker.test.ts` (2; same files as T7a)
- **Size:** M

**Description:** Extend the same invoker test file with the test-container detection/wait coverage: classification of test containers and wait behavior for success, failure, and timeout using controlled fake timers.

**Acceptance:**

- [x] Test-container classification assertions ported (`.test.` filename scan, name heuristics/`xq-` prefix, fallback keeper/e2e/test- matching — 7 tests).
- [x] Wait success/failure/timeout covered (6 tests; real short-interval timers as upstream — ps text parsing and retry semantics preserved).
- [x] No real spawn (execCommand/detectDockerCompose mocked via `vi.spyOn`); timers/env/cwd/listeners restored after each test.

**Verification (executed 2026-10-25):** expected RED with methods absent (`/tmp/xq-test-infra-evidence/t7b-red.log`, 13 failed), then `-t 'Test container polling'` → 13 passed (`t7b-green.log`); full invoker file → 30/30 (`t7ab-full.log`); `check`/`tsc -b`/eslint → exit 0. Post-review consolidation (same files, runtime untouched): added 9 tests — logs default/all-flags argv+stdio+cwd, ps argv, `down --rmi all`, `error.result` payload + stderr-over-stdout message priority, stdout fallback, 'No error output', timeout not forwarded to spawn, `timeout: 0` disables timer — and converted the running/timeout/ps-failure polling tests to fake timers; full file → **39/39** (`t7-full-v2.log`, combined log `t7t8-combined.log`).

## T8 — Port registry authentication + new Vitest coverage

- **Dependencies:** T2, T3
- **Files likely touched:** `packages/test-infra/src/services/registryAuth.ts`, `packages/test-infra/test/registryAuth.test.ts` (2)
- **Size:** M

**Description:** Port `registryAuth`, preserving module methods, errors, env/GitHub selection, and ephemeral env behavior. Upstream ships **no** registryAuth test file, so this task adds **new** Vitest coverage derived from the observed behavior — it does not port nonexistent tests: login argument handling and password over stdin, required-input errors, env/GitHub selection, and ephemeral env behavior. Mock spawn password-stdin and env; never a real token or login. Upstream defects are documented, not silently repaired.

**Acceptance:**

- [x] New Vitest coverage (20 tests) asserts login argv and password-via-stdin (never in argv), required-input errors, env/GitHub selection (DOCKER_* precedence, REGISTRY_* fallback, GITHUB_ACTOR/github-actions), autoLogin routing (ghcr + GITHUB_ACTIONS → GitHub flow; non-github registries → env flow), and ephemeral env behavior — derived from observed behavior, not claimed as ported upstream assertions.
- [x] No real credential, login, or registry mutation is reachable (`vi.mock` on `cross-spawn` default shape; dummy token strings only; mocked `Date.now` gives deterministic owned `docker-config-<n>` dirs removed after each test).
- [x] Upstream defects recorded in evidence, not fixed: env restored on exit only when originally defined (leak when undefined) and no restore on the `error` event path — both asserted as observed behavior; dead outer `try/catch` and dropped `options` in `loginFromGitHubActions`/`autoLogin` preserved verbatim.

**Verification (executed 2026-10-25):** expected RED (`/tmp/xq-test-infra-evidence/t8-red.log`, module-not-found), then `pnpm --filter @experiencequality/test-infra exec vitest run --config vitest.config.ts test/registryAuth.test.ts` → 20 passed (`t8-green.log`); combined invoker+auth → 59/59 (`t7t8-combined.log`); `check` → exit 0; `tsc -b` → exit 0; eslint clean. Test-safety correction (review follow-up): fixed `/tmp/docker-config-<n>` preguard-and-delete replaced by per-test `fs.mkdtemp` sandbox + `os.tmpdir` spy, path-beneath-sandbox assertions, and sandbox-only cleanup; rerun → 20/20 (`t8-auth-fixed.log`).

## T9 — Port compiled CLI + behavior tests

- **Dependencies:** T6, T7b (T8 required at this checkpoint — package completion includes it)
- **Files likely touched:** `packages/test-infra/src/cli/index.ts`, `packages/test-infra/src/bin/xq-infra.ts`, `packages/test-infra/test/cli.test.ts` (3); plus `package.json` (4th) and a minimal Node build helper (5th) **only if** the pack test proves an executable-mode fix is needed — prefer pnpm bin metadata handling, no extra build tool
- **Size:** M

**Description:** Port the CLI and its behavior tests. Execute actual `--help`/`--version` and `generate` (single-file, directory, gateway toggles, overrides, errors) through the compiled child bin's absolute path in a temp consumer cwd. Mocked CLI action tests cover up/down/logs argv and exit codes 1/3/4/5 without Docker. Build before subprocess tests; the version reads the manifest robustly via `import.meta.url` (`../../package.json` from both `src/cli` and `dist/cli`). Assert generated files land in the consumer temp cwd, not the package root.

**Acceptance:**

- [x] The compiled bin executes help/version/generate paths from a temp consumer cwd; generated files land there (9 subprocess cases incl. two frozen-baseline equivalences).
- [x] up/down/logs argv and exit codes 1/3/4/5 are covered without Docker; `--version` equals the manifest version.
- [x] Shebang is preserved in source and emitted to `dist/bin/xq-infra.js`; executable mode is not set by `tsc` — bin-mode/pack verification deferred to T12 per directive (no `package.json` changes in T9).

**Verification (executed):** `tsc -b` → exit 0 (`t9-build.log`); `vitest run --config vitest.config.ts test/cli.test.ts` → 21/21 (`t9-green.log`; pre-build run `t9-red-prebuild.log` failed the 9 subprocess cases on missing `dist/bin` as expected); corrected `test/registryAuth.test.ts` → 20/20 (`t8-auth-fixed.log`); `check` → exit 0; eslint on the 4 affected files → exit 0.

### Checkpoint C (after T7a–T9)

Review the invoker (T7a/T7b), auth, and CLI slices: ESM mock hoisting, no real spawn/login in mocked suites, compiled-bin execution, and exit-code parity. Confirm the package is self-complete before workspace activation.

## T10 — Activate seventh workspace in root gates

- **Dependencies:** T3–T9
- **Files likely touched:** root `tsconfig.json`, root `package.json`, `scripts/verify-structure.mjs`, `scripts/verify-structure.test.mjs` (4)
- **Size:** M

**Description:** Add the root project reference so root build/clean cover the target; include the infra package's local Vitest config in the root test selector; update the structure verifier to expect seven packages with an empty internal dependency boundary and to reject missing/duplicate/wrong module type, missing project reference, and missing build/check/test/bin wiring. Existing facade assertions stay unchanged.

**Acceptance:**

- [x] Root `tsc -b` builds test-infra via the new project reference and the root test selector includes `--filter @experiencequality/test-infra` (clean not executed — deferred to avoid deleting user dist).
- [x] The structure verifier expects seven packages, an empty infra internal dependency boundary, and rejects wiring regressions (wrong registry/module/bin/scripts, missing tsconfig reference, missing bin source, missing root test selector, unwanted internal deps in either direction).
- [x] All existing six-package assertions remain unchanged (facade exports/peers, legacy roots, lockfile scan untouched).

**Verification (executed):** `node --test scripts/verify-structure.test.mjs` → 16/16 (`t10-green.log`; RED first at `t10-red.log`, 15 fail on the old six-package verifier); `pnpm run verify:structure` → exit 0 (`t10-verify.log`); `pnpm run build` → exit 0 (`t10-build.log`); infra `check` → exit 0 (`t10-infra-check.log`); eslint + prettier on touched files → clean. Fixture tests use injected workspace lists over `mkdtemp` roots — no installs, no manifest mutations outside fixtures. Full root `check`/`test` not run (reserved for T14); no CI workflow edits.

## T11 — Extend release inventories and tests

- **Dependencies:** T10
- **Files likely touched:** `scripts/verify-release-version.mjs`, `scripts/verify-release-version.test.mjs`, `scripts/publish-packages.mjs`, `scripts/publish-packages.test.mjs` (4)
- **Size:** M

**Description:** Extend the release inventories to a seven-package lockstep set with infra's internal dependencies empty; the publish plan uses fake lookup/publish only. Existing resume/idempotence/lookup-failure tests stay intact.

**Acceptance:**

- [x] Lockstep validation and publish dry-run cover seven packages with correct ordering (infra appended last, independent) and empty infra internals.
- [x] No registry writes and no real publisher are reachable from the tests (all lookups/publishes are injected fakes; fixture roots are `mkdtemp`-owned and removed).

**Verification (executed):** `node --test scripts/verify-release-version.test.mjs scripts/publish-packages.test.mjs` → 13/13 (`t11-green.log`; RED first at `t11-red.log`, 4 expected failures); `node scripts/verify-release-version.mjs --version 1.0.3` → "release version 1.0.3 matches all 7 publishable packages and internal dependencies" (`t11-verify-cli.log`); eslint + prettier on the 4 files → clean.

## T12 — Verify archive and isolated installed CLI

- **Dependencies:** T9, T10, T11
- **Files likely touched:** `scripts/verify-packages.mjs`, `scripts/verify-infra-package.mjs` (new), `scripts/verify-infra-package.test.mjs` (new) (3)
- **Size:** M

**Description:** Write `scripts/verify-infra-package.mjs` as a dual interface: an **import-safe library** (no effects on import) plus a **guarded CLI** — `node scripts/verify-infra-package.mjs --archive <absolute-tarball-path> --consumer-smoke`. The CLI validates the archive (manifest, bin target, shebang, file mode, LICENSE, provenance, and the strict existing source exclusions) and then installs it into a new temp consumer with `--ignore-scripts`, executing the installed bin smoke: `--help`/`--version` and `generate` (single + multi-file, gateway, overrides, failure paths) with outputs landing in the consumer directory. The full `verify-packages` seven-package run calls the **same exported** validation/consumer functions — it does not recompute the smoke independently. `scripts/verify-infra-package.test.mjs` stubs subprocess/archive inspection and uses synthetic listings/manifests. Extend `scripts/verify-packages.mjs` to seven packages plus the consumer smoke via those exported functions; the existing six archive assertions stay untouched and the helper takes no custom exception. Assert ownership of input temp dirs and cleanup.

**Acceptance:**

- [x] `verify-infra-package.mjs` is import-safe and exposes `assertInfraArchiveContents`/`inspectInfraArchive`/`verifyInfraConsumer` (plus `parseInfraVerifyArgs`), reused by `verify-packages`; its guarded CLI honors `--archive <absolute-tarball-path> --consumer-smoke`.
- [x] The external consumer install executes the linked compiled bin (`node_modules/.bin/xq-infra` run directly) with `NODE_PATH` stripped; generated files land in the consumer cwd; the consumer dir is removed on success and preserved for evidence on failure.
- [x] Existing six archive assertions untouched; the same generic `assertPackedPackageContract` applies to all seven archives.

**Verification (executed):** `node --test scripts/verify-infra-package.test.mjs` → 19/19 (`t12-unit.log`; RED first at `t12-red.log`); real `pnpm --filter @experiencequality/test-infra pack --pack-destination /tmp/xq-infra-pack-wRZXbS` → archive lists only `package.json`, `README.md`, `UPSTREAM.md`, `LICENSE`, `dist/**`; `tar -tvzf` shows `package/dist/bin/xq-infra.js` mode `-rwxr-xr-x` (no bin-mode fix needed); `node scripts/verify-infra-package.mjs --archive ... --consumer-smoke` → archive contents verified + consumer smoke passed (`t12-smoke.log`). `verify-packages.mjs` updated (artifacts now `artifacts/packages-<rand>` per run — no recursive rm, six preexisting Oct-18 archives preserved; infra resolve special-cases `package.json` subpath; single exported `verifyInfraConsumer` call) — full run deferred to T14; `node --check` + eslint + prettier clean (`t12-eslint.log`).

### Checkpoint D (after T10–T12)

Review activation diffs, release inventories, and the archive/consumer proof. Confirm the staged-failure period is closed, gates now pass for seven packages, and no destructive gate ran without inspection.

**Accepted — 2026-10-25:** lead reviewed T10–T12 diffs, the 19/19 unit log, real-pack contents, `-rwxr-xr-x` bin mode, and the consumer-smoke log.

## T13 — Docs and consumer cutover guidance

- **Dependencies:** T12
- **Files likely touched:** `README.md`, `docs/deliverables.md`, `docs/development.md`, `docs/release-policy.md`, `packages/test-infra/README.md` (5)
- **Size:** M

**Description:** Document the seventh package: company-registry installation under the new scope, the Node 24 compiled CLI, retained command options and YAML contracts, the TS + Vitest dev commands, and the absence of a JS deep-import guarantee. Rollback docs state the preflight that the previous package version is installable plus the old dependency pin/lockfile; there is no actual consumer migration here, upstream stays untouched, and there is no automatic data cleanup. The baseline report and provenance already landed at T1/T3.

**Acceptance:**

- [x] All five docs describe the seventh package, new-scope install command (labeled not-yet-published), retained CLI, and Node `>=24` consistently.
- [x] Rollback docs include the installability preflight (old-scope availability confirmed before switching a consumer to the new scope), old pin/lockfile restore, no co-install under the same bin name, and no automatic cleanup claims.

**Verification (executed):** commands cross-checked against the manifests and compiled-bin help (documented `xq-infra` commands/options match `src/cli/index.ts`); loader extension/sort/config-fallback claims verified against `src/services/serviceLoader.ts`; `pnpm exec prettier --check README.md docs/deliverables.md docs/development.md docs/release-policy.md packages/test-infra/README.md` → clean after formatting only the touched files (`t13-prettier.log`); `git diff --check` clean. No unrelated files reformatted.

## T14 — Final proof + lead review

- **Dependencies:** T1–T13
- **Files likely touched:** none (read-only evidence; logs land in a task-owned external temp location, or existing artifacts only if known safe — never delete preexisting artifacts)
- **Size:** M

**Description:** Final proof and lead review; no source writes expected. Run the one final complete gate; if checks fail, rerun only the affected failing checks after fixes — do not rerun the whole suite per handoff, and a failure rerun is not claimed as done until it passes. The previous `verify-packages` artifact hazard was fixed at T12: each run packs into a new `artifacts/packages-<random>` child and preexisting archives are preserved — inspected and hash-verified before execution (six Oct-18 tarballs intact, `t14-artifacts-before.sha256`). Root `verify:packages` may start existing test servers/browser-related imports — permitted; no Docker lifecycle is permitted, and `ci-test.mjs` is not run because of its Docker cleanup. Source tests ran focused earlier. Node 24/26 evidence comes from existing CI only if available/authorized — do not claim both if only a local runtime ran. The lead reviews the complete diff: no source suppression, skips, raw-source packaging, or Jest in the target; all 15 tasks have acceptance evidence. Report baseline/environment blockers honestly; Docker proof remains deferred; no pushes, commits, or publish requested.

**Acceptance:**

- [x] The final complete gate ran with captured evidence (`pnpm run check` exit 0; `pnpm test` exit 0 — 7 suites, 251 tests incl. infra's 155; `node --test` scripts → 48/48; `verify-release-version --version 1.0.3` → all 7; `pnpm run verify:packages` → "verified 7 archives", exit 0 via a resume continuation after an environment interruption — no rebuild/repack, old 6 artifacts hash-unchanged). No failing checks needed reruns. Mutation proof: inverted `type` assertion on a temp copy fails (`t14-mutation.log`).
- [x] The lead reviewed the complete diff and every task's acceptance evidence — Checkpoint E approved 2026-10-25; blockers reported truthfully (see `docs/migrations/test-infra-verification.md`).
- [x] No commits, pushes, tags, registry writes, or Docker lifecycle occurred.

**Verification (executed):** logs `/tmp/xq-test-infra-evidence/t14-{check,test,node-tests,release-version,verify-packages,verify-packages-resume,mutation}.log`; artifact hashes `t14-artifacts-before.sha256`; summary `docs/migrations/test-infra-verification.md`. Docker lifecycle and Node 26 remain unverified by design.

### Checkpoint E (after T13–T14)

Lead reviews docs plus the complete final diff and evidence log. Migration proof is Docker-free; optional real-Docker verification remains a separately approved step.
