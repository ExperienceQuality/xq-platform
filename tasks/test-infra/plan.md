# Implementation Plan: @experiencequality/test-infra

**Status:** Approved — 2026-10-24 (maintainer approval).
**Implements:** the approved `SPEC-test-infra.md` (TypeScript rewrite + Vitest amendment).
**Task list:** `tasks/test-infra/todo.md` (explicit custom downstream task-list target; the existing `tasks/plan.md` and `tasks/todo.md` are untouched).

## Scope

- Strict TypeScript 5.9 ESM (NodeNext) rewrite of the upstream CommonJS CLI, Vitest 4 tests, seventh publishable workspace package at `packages/test-infra`, Node `>=24`.
- Compiled bin target `dist/bin/xq-infra.js`; shared `1.0.3` snapshot version; company GitHub Packages registry; Apache-2.0 provenance; pinned source commit `3d74803af7b71c9e946523ac7dd6d6e695cc8f07`.
- Dependency downloads are approved for this migration, including the isolated upstream baseline. No source code changes until this plan is approved.
- The six existing packages' behavior and public APIs are unchanged. No demo, `env-registry`, or upstream CI migrations; no extra lockfile in the workspace; no publish; no real Docker lifecycle or registry login.

## Architecture (settled)

- Internal typed service models live in `src/types.ts`. YAML/JSON external inputs are narrowed from `unknown` without adding new rejection rules or behavior.
- Keep the current service method names and singleton behavior as internal ESM exports for a faithful port; no public root API.
- `serviceLoader` owns directory/global-config/dependency validation. `gateway` owns nginx route text. `composeGenerator` composes these and owns the same cwd output files and cleanup. `composeInvoker` owns typed spawn results, `error.result`, timeout handling, Compose detection, and test-container polling. `registryAuth` ports the existing logic with mocked credentials only — no opportunistic fixes.
- The CLI registers the same Commander commands/options and exit codes 1–5; JSON overrides load via `fs` read + `JSON.parse`; the manifest version is read from `../../package.json` relative to `import.meta.url`, working from both `src/cli` and `dist/cli`. The source bin uses an ESM import with `await main` and proper startup error reporting; the binary name, shebang, and packed executable mode are preserved.
- TS project references and build/check wiring per spec; the package Vitest config uses a fork pool with `fileParallelism: false` for temp-cwd tests — root globals and pool defaults are not weakened.
- Keep the six used dependency ranges per spec plus only the necessary compatible `@types`; no Jest is added to the target lockfile. Historical Jest is used only for the isolated baseline.
- Pack `dist` plus docs/license/provenance — no archive exception; upstream source CJS deep-import compatibility is not guaranteed.
- The infra archive check is a dual interface: an import-safe library (`scripts/verify-infra-package.mjs`, no effects on import) plus a guarded CLI (`--archive <absolute-tarball-path> --consumer-smoke`). The seven-package verifier calls the same exported validation/consumer functions rather than recomputing the smoke — a pure helper keeps the check deterministic and testable with synthetic fixtures.

## Work sequencing

15 execution tasks: T1–T14, with the invoker slice split into T7a/T7b.

- T1 (baseline) → T2 (compiler/types contract) → T3 (package metadata/install).
- After T2/T3: T4 (loader) and T5 (gateway) proceed independently; T6 (generator) follows T4/T5.
- T7a then T7b (process/Compose invoker — serial slices on the same two files: spawn/detection/command semantics, then test-container classification/polling) can proceed after T2/T3 independently of the generator.
- T8 (registry auth) after T2/T3 independently — but do not parallelize edits to shared `types.ts`, `package.json`, or lockfiles.
- T9 (CLI) after T6/T7b; T8 has no direct CLI dependency but package completion includes it.
- T10 (workspace activation/root gates) after T3 and runtime T4–T9; T11 (release inventories) after T10; T12 (archive/consumer proof) after T9–T11; T13 (docs) after T12; T14 (final gate/review) after everything.
- Hands-on implementation and tests are delegated to execution; the lead reviews every slice and all authority actions.
- Shared files are owned serially — `types.ts` by T2, manifest/lockfile by T3, root wiring/structure by T10, release arrays by T11, the pack verifier by T12. The `types.ts` interface is frozen before the parallel T4/T5/T7a/T8 slices; T7b follows T7a serially on the same two files.

## Intermediate integrity policy

- Source slices remain individually buildable and testable using package-focused gates.
- Creating a seventh workspace at T3 necessarily makes the strict six-package structure/release/package-inventory gates fail temporarily until activation at T10/T11. This is staged feature-branch work, not a passing whole-repository state — it is documented explicitly here. Do not weaken gates, and do not merge, tag, or publish intermediate slices.
- Before activation, run isolated existing-six test filters where needed rather than the root check with its known inventory failure.
- If maintainers require every commit to be root-green, batch the T3–T11 activation as one integration landing (with small diffs reviewed first). No placeholder CLI or stubbed behavior may be used to get green.
- Never claim complete root gates before activation.
- Do not run the full suite at every handoff — one final complete gate at T14; if checks fail, rerun only the affected failing checks after fixes rather than the whole suite per handoff.

## Risks and mitigations

- **Behavior drift** via ESM JSON loading or mock hoisting — compare parsed outputs; use ESM-aware `vi.mock` factories registered before imports.
- **Strict typing** of optional properties and `unknown` boundaries — narrow without changing validation.
- **Singleton listeners/cwd test pollution** — private temp working directories, fork pool, explicit cleanup.
- **Tarball bin linking, file mode, and version resolution** — verify via an external consumer install with no workspace fallback, so workspace/source imports cannot hide missing dependencies.
- **Staged inventory-gate failures** — explicit checkpoints; never reported as green early.
- **Upstream baseline defects** — fail fast, record evidence, no silent fixes.
- **Registry tokens** — never printed; credentials are always mocked.
- **Preexisting `artifacts/` deletion hazard** in `verify-packages` — inspect before execution.
- **Node 24/26 claims** — based on evidence (existing CI where authorized), not assumed.

## Rollback

The import is additive; upstream is not changed. Consumers keep the old version: preflight that the previous package version is installable, then restore the old pin and lockfile. There is no automatic volume/container cleanup.

## Remaining approvals

No further product questions. Only plan approval before code, plus exact opt-in approval for any real Docker or destructive actions.
