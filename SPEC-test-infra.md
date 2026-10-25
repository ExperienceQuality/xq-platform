# Spec: Import xq-test-infra as @experiencequality/test-infra

**Status:** Approved with amendment — TypeScript rewrite and Vitest tests, per maintainer approval. Implementation plan approved 2026-10-24; execution proceeds per `tasks/test-infra/`.

## 1. Objective

Import the reusable Docker test-environment CLI from the standalone `xq-test-infra` repository so it becomes the **seventh publishable workspace package** in `xq-platform`. The interfaces and behavior of the existing six packages remain unchanged.

## 2. Source and target baseline

### Upstream source

- Repository: <https://github.com/chauhaidang/xq-test-infra>
- Pinned commit: `3d74803af7b71c9e946523ac7dd6d6e695cc8f07`
- Upstream package identity: `@chauhaidang/xq-test-infra@1.0.3`
- License: Apache-2.0
- The user has confirmed that only the reusable code is imported; demos stay outside the package.

### Historical source baseline (inspected)

- Source runtime: CommonJS JavaScript
- Upstream unit tests: Jest 30.1.1

These describe the upstream starting point only. They do not define the target toolchain.

### Target repository baseline (inspected)

- Root package version: `1.0.3`
- Package manager: pnpm `12.10.0`
- Node engine: `>=24`
- Root toolchain: TypeScript 5.9 (ESM root), ESLint 9, Prettier 3, Vitest 4
- **Target runtime:** strict TypeScript 5.9, ESM with NodeNext module resolution, compiled with the existing root `tsc` project references.
- **Target tests:** TypeScript under Vitest 4, using the existing root toolchain.
- No CommonJS, raw-JS, or Jest exception applies to the target package. No shipped TypeScript runtime runner (`ts-node`, `tsx` bin) and no Jest dependency is permitted.

### Inspection basis

All findings in this spec come from **inspection, not execution**: no source tests were run and no dependencies were installed. Runtime behavior and dependency installation remain unverified; implementation must establish the baseline described below.

## 3. Approved decisions

The following are settled by maintainer approval of this spec (including the TypeScript/Vitest amendment); they do not need re-approval.

- **Directory and name:** the package lives at `packages/test-infra` and is published as `@experiencequality/test-infra`.
- **Executable name unchanged:** the CLI binary stays `xq-infra`.
- **TypeScript rewrite and Vitest tests:** approved; the CommonJS/Jest exception originally proposed is withdrawn.
- **Version alignment:** the initial manifest version follows the root's current aligned version (`1.0.3` today). No release, version bump, or publish happens as part of the migration itself. The new package joins the existing lockstep version policy and the company GitHub Packages publishing policy.
- **Runtime support change:** Node `>=24` is consistent with platform policy and **intentionally drops** upstream's documented Node 18/20 support. This is an explicit runtime support change — do not claim universal backward compatibility.
- **Scope transition:** there is no transparent alias from the old npm scope. The migration leaves upstream untouched, so the old `@chauhaidang/xq-test-infra` package is expected to remain available; however, availability of an externally published version is not verified or guaranteed by this spec. Consumers opt into the new install.

## 4. Package structure

```
packages/test-infra/
  package.json
  README.md
  LICENSE
  UPSTREAM.md            # URL, pinned commit, original identity, migration-only adjustments
  tsconfig.json
  tsconfig.test.json
  vitest.config.ts
  src/bin/xq-infra.ts
  src/cli/index.ts
  src/services/composeGenerator.ts
  src/services/composeInvoker.ts
  src/services/gateway.ts
  src/services/registryAuth.ts
  src/services/serviceLoader.ts
  src/types.ts
  test/                  # ported upstream unit assertions + isolated CLI contract tests
    **/*.test.ts
```

- `package.json` sets `"type": "module"` explicitly.
- `bin`: `{ "xq-infra": "./dist/bin/xq-infra.js" }`. The generated `dist/bin/xq-infra.js` is the bin target; the source bin keeps its shebang, which `tsc` preserves in the emitted output. The packed executable mode is validated — and fixed by minimal build-metadata handling if needed.
- Published `files`: `dist/`, `README.md`, `LICENSE`, `UPSTREAM.md`, `package.json`.
- The package follows the **same strict dist-present / source-test-config-excluded packaging checks as the existing six** — no archive exception.
- Do **not** introduce a new public root library API.
- Upstream's internal CommonJS deep-import paths are **not** preserved by the TypeScript `dist` layout and are outside the CLI compatibility guarantee. Document this scope explicitly; do not claim general JS import compatibility. The CLI and config behavior is the preservation boundary.
- The CLI executable's shebang and executable file mode are preserved and verified both in the packed tarball and in an installed external consumer.

### TypeScript build wiring

- `tsconfig.json` extends `../../tsconfig.base.json` with `composite: true`, `rootDir: "src"`, `outDir: "dist"`, `tsBuildInfoFile: ".tsbuildinfo"`, including `src/**/*.ts`. The root `tsconfig` gains a project reference to `packages/test-infra`.
- `tsconfig.test.json` extends `../../tsconfig.test.base.json`, includes `src`/`test`/config, and sets `noEmit: true`.
- Package scripts: `build` → `tsc -b`; `check` → `tsc -p tsconfig.test.json --noEmit`; `test` → `vitest run --config vitest.config.ts`.
- `vitest.config.ts`: `environment: 'node'`, `include: ['test/**/*.test.ts']`, `pool: 'forks'`, `fileParallelism: false` to support isolated temporary-cwd tests. Do not change global pool defaults.

### Code style

- Strict TypeScript, ESM `import`/`export`, `.js` specifiers on relative imports, `import type` for type-only imports, formatted with the root Prettier settings (single quotes, semicolons). Illustrative style only — not a proposed API:

  ```ts
  import path from 'node:path';

  function resolveSpecPath(file: string): string {
    return path.resolve(process.cwd(), file);
  }
  ```

- Typed models for service specs, compose output, command options/results, and external process boundaries.
- Use `unknown` for parsed JSON/YAML and caught errors, narrowing before use. No blanket `any`, no `@ts-ignore`, no disabled strictness, and no behavior-changing added validation.
- Port logic, ordering, errors, and side effects — this is a faithful rewrite, not a product refactor.

## 5. Behavior boundary (must be preserved)

### Commands, flags, and exit codes

- Preserve `generate`, `up`, `down`, `logs` and all their flags, outputs, and exit behavior:
  - generation / override failures → exit `2`
  - `up` failures → exit `3`
  - `down` failures → exit `4`
  - `logs` failures → exit `5`
  - failed test containers → exit `1`
- `--version` output must equal the **new** manifest version.

### Inputs, outputs, and runtime semantics

- Single YAML file inputs and directories of `*.service.yml` / `*.service.yaml` files.
- Global `xq.config` files.
- Overrides, service dependencies, and port assignment.
- Gateway defaults, routing, and healthcheck dependencies.
- Generated filenames `xq-compose.yml` and `nginx-gateway.conf`, written in the consumer's current working directory.
- Compose v2 detection with v1 fallback.
- Pull / no-pull behavior and log options.
- Test-container detection and wait behavior.
- The `registryAuth` source module (ported to TypeScript).

### Rewrite constraints

- The CLI async `main` uses ESM imports. JSON overrides are loaded with `fs` read + `JSON.parse` (not `require`), preserving the same JSON error exit `2`.
- The manifest version is read relative to `import.meta.url` so it resolves correctly from both the compiled `dist/cli/index.js` and the source `src/cli/index.ts` (`../../package.json`). No source-relative paths or workspace-cwd assumptions may leak into the packed runtime.
- Behavior is preserved while the runtime modules are rewritten to strict TS/ESM and the tests to Vitest; only the rewrite adjustments necessary for that conversion are authorized.
- Do **not** mix upstream bug fixes into the migration. If a baseline failure is found, record it with evidence rather than weakening assertions to pass. No new features or unrelated fixes.

## 6. Dependencies

### Retained runtime dependencies (resolved by the single root pnpm lockfile)

- `commander ^11.0.0`
- `cross-spawn 7.0.6`
- `fs-extra ^11.1.1`
- `uuid ^9.0.0`
- `which ^2.0.2`
- `yaml ^2.3.1`

### Type declarations

- Add only the `@types` packages needed for retained dependencies that ship no types, as package-local devDependencies: `@types/cross-spawn`, `@types/fs-extra`, `@types/which`, `@types/uuid` — appropriate compatible majors, with exact versions chosen against the resolved existing runtime versions during the approved install.

### Omitted

- `@chauhaidang/xq-js-common-kit@1.0.6` is declared upstream but is **not imported by any shipped runtime file** inspected. Omit this unused private dependency; prove the absence of runtime references before importing the source.

### Test tooling

- Use the existing root TypeScript/Vitest toolchain — no second test runner.
- **No Jest dependency** in the target package, root, or lockfile. Historical Jest may be used **only** in the isolated upstream baseline; dependency downloads are approved for this migration.
- No new coverage packages or thresholds are introduced.

### Not copied from upstream

- No upstream ESLint 8 config, npm lockfiles, `.npmrc`, or workflow files are copied; nothing is installed from upstream pipelines.

### Internal dependency rules

- The new package has **no** internal dependency on `core`, `db`, `stub`, `rest-client`, `test`, or `test-browser`.
- None of the existing packages are made to depend on `test-infra` in this slice.

## 7. Integration requirements

These are requirements on the eventual change, not implementation tasks to perform now.

### Package inventory and verification scripts

- Update the explicit approved package inventories in `scripts/verify-structure.mjs`, `scripts/verify-packages.mjs`, `scripts/verify-release-version.mjs`, `scripts/publish-packages.mjs`, and their fixture tests.
- The expected package count becomes **seven**; `test-infra`'s internal dependency list is empty.

### Root gates

- Extend the root test selector to the new package's Vitest script — add the new package only.
- The root `tsc -b` build, recursive `check`, and `clean` apply to `test-infra` normally through the project reference; no syntax-validation exception and no CJS/Jest lint globals are needed.
- Root lint follows the existing TypeScript rules.

### CI

- Existing CI runs the canonical root commands; use those seams rather than importing upstream pipelines.

### Packaging verification

- `verify-packages` packs all seven packages and preserves the existing six assertions; all seven dist-packaging assertions apply to `test-infra`.
- It validates the infra package's emitted bin target, shebang, and executable mode; the tarball must contain no `src`/bin sources, tests, Jest or other test configs, dependency secrets, demos, or extra lockfiles — with **no** relaxation of the private source policy for the six.
- It installs the packed archive into an external temporary consumer and runs the **installed** `xq-infra` — not a workspace-relative executable.

### Release policy

- Root package arrays and tests are updated consistently with lockstep release validation and publish dry-run tests; no real publisher is ever invoked.

### Documentation

- Update `README`, deliverables, development, and release-policy docs plus the new package README to describe the seventh package, the scope-change install command, the retained CLI, Node `>=24`, and the TypeScript rewrite.
- The Apache `LICENSE` and attribution are retained; do not invent any transfer of authorship or legal ownership.
- Source examples go to `docs/examples/test-infra/`, not into the package. Selected fixtures under `test/` are permitted.

### Out of scope

- `todo-app`, `env-registry`, upstream custom CI, and full demo migration are **out of scope** and stay untouched in the upstream repository. No new demo workspace is required. (A separate `apps/infra-e2e/` real-Docker verification demo is proposed in `SPEC-test-infra-e2e.md`; if approved, it supersedes this no-demo restriction **only** for that app — this spec's migration status is unchanged.)

## 8. Target acceptance commands

These are the acceptance commands for the completed migration; they are **not claimed to work today**.

```bash
pnpm install --frozen-lockfile
pnpm --filter @experiencequality/test-infra run build
pnpm --filter @experiencequality/test-infra run test
pnpm run build
pnpm run check
pnpm test
pnpm run verify:structure
pnpm run verify:packages
node --test scripts/verify-structure.test.mjs scripts/verify-release-version.test.mjs scripts/publish-packages.test.mjs
node scripts/verify-release-version.mjs --version 1.0.3   # must match the approved snapshot/root version if it changes before execution
pnpm --filter @experiencequality/test-infra exec xq-infra --help
pnpm --filter @experiencequality/test-infra exec xq-infra --version
```

- Dependency downloads are **approved** for this migration, including the isolated upstream baseline.
- Package tests run through the package-local Vitest config (`vitest run --config vitest.config.ts`, fork pool, file parallelism disabled).
- Default validation must **not** execute a real Docker lifecycle or registry login.

## 9. Testing strategy

### Baseline and preservation

- Establish a baseline of the upstream non-Docker tests at the pinned source commit **before** the rewrite, using the isolated historical toolchain (Jest) — dependency downloads are approved; preserve that baseline evidence. Final target assertions are all Vitest.
- Isolate tests that write cwd outputs in unique temporary working directories so no source or repo files are overwritten or deleted; serialize where `process.cwd` singleton behavior requires it (package `fileParallelism: false`).

### Vitest port

- Port upstream assertions to Vitest with **explicit imports** from `vitest` (`describe`, `test`, `expect`, `beforeEach`, `afterEach`, `vi`, etc.).
- `jest.mock` → `vi.mock` with ESM-appropriate factories and hoisted mocks; Jest reset/spy/timer behavior is translated while preserving the assertions.
- Mock `cross-spawn` and `which` **before** the imports under test; do not assume `vi.mock` intercepts CommonJS `require`.
- Keep the same argv/env/cwd and error coverage for up/down/pull/logs, Compose v2/v1 detection, and test-container handling (success, failure, timeout) with controlled timers.
- Add typed child-process emitters (`stdin`/`stdout`/`stderr`) and fake timers where required; restore mocks, timers, env, cwd, and listeners after each test.
- No real Docker auth or lifecycle by default.

### Ported assertions

- Port all upstream non-Docker CLI assertions, including generate with gateway on/off, overrides success / invalid / missing file (exit 2), and help/version.
- Add directory + global-config generation coverage and an output-equivalence baseline against the imported runtime: compare **parsed** compose structures and nginx content, normalizing only unavoidable temp paths to maintain equivalence.
- Registry auth is exercised only through a mocked process — never real credentials or a real login.
- Preserve upstream baseline failures as evidence; do not silently fix bugs or weaken assertions.

### Packed-consumer tests

- Installed-tarball CLI tests run from a separate consumer cwd and verify: executable linking of the **compiled** bin, help/version, single- and multi-file generation, generated files landing in the consumer cwd (not the package or repo root), gateway/no-gateway/override behavior, and failure paths.
- The external packed consumer install must not be able to use workspace `node_modules` to hide missing dependencies.

### Structural fixtures

- Test-infrastructure fixtures must reject: a missing seventh package, bad registry/version, unwanted cross-package dependencies, missing bin/runtime/LICENSE, included demos or lockfiles, and any accidental relaxation of the six existing packages' checks.
- They must additionally reject a missing TS project reference or emitted bin, a wrong module type, and omitted compile/check/test wiring for the new package.

### Reporting discipline

- No coverage threshold is invented or lowered.
- Baseline failures and blocked Docker checks are reported distinctly — never hidden.
- Real Docker `up`/`down`/`logs` verification is a deferred opt-in step requiring approval of the exact isolated commands, including cleanup. By default: no shared containers, no orphan cleanup, no volume deletion, no registry mutation, and no network image pulls. Full Docker runtime parity is therefore **not claimed** by the Docker-free proof.

## 10. Rollout and rollback

### Forward path

1. Additive import first.
2. Validate in the workspace and in the packed external consumer.
3. Opt-in consumers then switch the dependency scope; CLI and config stay the same.

### Upstream

- The existing published package and source repository remain unmodified: no deletion, archival, deprecation, or publish.

### Rollback

- Consumers roll back to the previous `@chauhaidang/xq-test-infra` pin and lockfile; the existing YAML and generated-file contracts remain, and there is no runtime data migration. Because the availability of the previously published external version is not verified or guaranteed, rollback requires confirming the previous package version can actually be installed **before** any consumer cutover. Reading private registries is not required now — this is a pre-cutover check, not a spec-stage task.
- Rollback does **not** clean volumes or containers automatically; that needs separate approval.
- The old package is never automatically removed or its contract altered.

## 11. Boundaries

### Always

- Preserve the six existing packages' contracts and tests.
- Preserve source provenance and the Apache license.
- Keep one root lockfile.
- Keep the scope strict and isolate side effects.

### Ask first

- Real Docker lifecycle/cleanup and any external side effects.
- Publications, releases, tags, or upstream changes.
- New public APIs or features. (TypeScript conversion is explicitly approved and no longer pending.)

### Never

- Committing secrets or copying upstream `env-registry` credentials or `.npmrc`.
- An extra lockfile.
- Deleting user changes.
- Disabling or skipping failing assertions to make checks pass.
- Globally weakening quality gates.
- Destructive Docker cleanup.
- Publishing or modifying upstream implicitly.

## 12. Success criteria

- Seven packages are correctly discovered, packable, and version-aligned.
- The compiled ESM `xq-infra` bin installs and runs with the same CLI semantics on Node 24/26 CI — no TypeScript or Jest runtime needed.
- The existing six packages' gates are unchanged and passing.
- Source and tests typecheck; the ported upstream non-Docker assertions and the added CLI/packed-consumer Vitest tests pass.
- The source stays strict TypeScript/ESM, and the archive preserves license and provenance under the same dist-packaging contract as the six.
- Root canonical gates include infra.
- No demos, secrets, or extra lockfiles land in the tarball.
- Rollback docs are explicit.
- Any environment or baseline blockers are reported truthfully rather than passed.

## 13. Remaining gates

The previously open questions are resolved by the approved amendment: the `@experiencequality/test-infra` name/`packages/test-infra` path, the TypeScript/Vitest target toolchain, Node `>=24`, and the lockstep release policy are all settled.

What remains gated:

1. ~~Implementation plan and task review~~ — **approved 2026-10-24** (`tasks/test-infra/plan.md`, `tasks/test-infra/todo.md`); implementation proceeds per those documents.
2. Optional, explicitly approved exact-command Docker verification — still pending.

Dependency downloads are approved for this migration (see §6 and §8).
