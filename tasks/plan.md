# Implementation Plan: Node.js Monorepo Restructure

## Status

Approved on 2026-10-14. Tasks 1–17 complete on 2026-10-14; Checkpoint 3 ready for review.

## Overview

Migrate the repository from npm workspaces to pnpm 12.10.0, normalize workspace layout,
centralize repeated TypeScript and Vitest policy, and convert repository automation, CI, release,
and documentation without changing published package behavior.

The plan uses contract-first parallel waves. A small shared contract lands first. Independent
slices then run in separate branches or worktrees with disjoint file ownership. An integration
task merges and verifies each wave before the next shared contract changes.

Detailed acceptance criteria and commands live in `tasks/todo.md`.

## Architecture Decisions

- `pnpm-workspace.yaml` becomes the only workspace-membership source. Task 1 temporarily retains
  matching `package.json` globs so the existing structure gate stays green; Task 8 removes them
  when pnpm-based discovery replaces that gate. Root `package.json` pins `pnpm@12.10.0`.
- `pnpm-lock.yaml` is the only lockfile. Internal dependencies use `workspace:*`; packed manifests
  must contain exact aligned versions.
- TypeScript project references remain the build-order mechanism. No task runner is added.
- Root scripts and target paths are contracts. Parallel slices may consume them but must not edit
  them unless assigned ownership.
- Simple package suites become named root Vitest projects. Facade database, facade integration,
  and private application configurations remain local because their behavior is unique.
- Structure validation discovers workspaces through pnpm rather than parsing YAML or keeping a
  second package list.
- `showcase/backend-e2e` moves intact to `apps/backend-e2e`; package name and behavior remain
  unchanged.
- Every parallel slice uses a dedicated branch/worktree. Only integration tasks merge slices and
  update shared evidence.

## Dependency Graph

```text
Task 1: pnpm root contract
├── Task 2: workspace dependency contract ─┐
├── Task 3: pack/consumer automation ──────┤
├── Task 4: publish automation ────────────┼── Task 6: foundation integration
└── Task 5: aggregate CI runner ───────────┘
                                              │
                                              ▼
Task 7: application relocation
├── Task 8: topology validator ────────────────┐
├── Task 9: shared tooling contracts ─┐        │
├── Task 10: GitHub Actions ──────────┼────────┼── Task 17: final integration
├── Task 11: primary docs ────────────┤        │
└── Task 16: remaining docs ──────────┤        │
                                      │        │
Task 9 ─┬── Task 12: leaf TS configs ─┤        │
        ├── Task 13: dependent TS ────┤        │
        ├── Task 14: core/rest Vitest ┤        │
        └── Task 15: db/stub Vitest ──┘        │
```

## Parallel Waves

### Wave 0: Shared pnpm Contract

- Task 1 runs alone.
- It freezes package-manager version, initial workspace paths, lockfile, and root command names.
- No later Wave 1 task may edit its four owned files.

### Wave 1: pnpm Behavior — Four Tasks in Parallel

- Task 2: internal workspace dependency and release validation (including normalizing the
  already-declared direct `rest-client` dependency to `workspace:*`).
- Task 3: package archive and fresh-consumer verification.
- Task 4: registry lookup and publication automation.
- Task 5: aggregate local CI orchestration.

Tasks 2–5 share no files. Task 6 integrates all four and runs Checkpoint 1.

### Wave 2: Layout Contract

- Task 7 runs alone because it changes workspace identity and shared paths.
- It moves the application and updates path-critical owners before any later slice starts.

### Wave 3: Independent Repository Surfaces — Four Tasks in Parallel

- Task 8: dynamic topology validation.
- Task 9: root TypeScript/Vitest contract files.
- Task 10: GitHub Actions.
- Task 11: primary documentation.

Tasks 8–11 share no files.

### Wave 4: Package Tooling and Remaining Docs — Five Independent Tasks

- Task 12: leaf-package TypeScript configs.
- Task 13: dependency-bearing TypeScript configs.
- Task 14: `core` and `rest-client` Vitest migration.
- Task 15: `db` and `stub` Vitest migration.
- Task 16: consumer, application, and remaining documentation.

Tasks 12–16 share no files. With four execution slots, run any four first, then the fifth. Task 17
integrates every slice and runs final acceptance.

## File Ownership Rules

| Task | Exclusive files or trees |
| --- | --- |
| 1 | `package.json`, `pnpm-workspace.yaml`, lockfiles |
| 2 | `packages/core/package.json`, `packages/test/package.json`, release-version verifier/tests |
| 3 | `scripts/verify-packages.mjs` |
| 4 | publish script and publish tests |
| 5 | `scripts/ci-test.mjs` |
| 7 | application tree move plus path edits in workspace/CI/temporary validator |
| 8 | structure verifier, its tests, and removal of temporary root workspace globs |
| 9 | root test TypeScript base and root Vitest config |
| 10 | four Node GitHub Actions workflows |
| 11 | five primary docs |
| 12–15 | mutually exclusive package config/manifest pairs |
| 16 | remaining four docs |

If a slice discovers a required edit outside its ownership, it records the need for its integration
task instead of editing the shared file.

## Checkpoints

### Checkpoint 1: pnpm Foundation

- Frozen install, build, unit/integration tests, release validation, publication-plan tests, and
  fresh-consumer archive verification pass.
- No npm workspace orchestration remains in repository-owned scripts.
- Human reviews evidence before layout work starts.

### Checkpoint 2: Layout Contract

- pnpm sees exactly six child workspaces.
- Application type checking and Docker Compose configuration pass from `apps/backend-e2e`.
- No active `showcase/` or Kafka placeholder remains.
- Human reviews evidence before Waves 3 and 4.

### Checkpoint 3: Complete

- All specification success criteria have evidence.
- Focused and aggregate test selection matches pre-migration behavior.
- CI, docs, package archives, and release automation use approved contracts.
- Human receives final diff and verification summary.

## Integration Strategy

- Each parallel task starts from the same completed dependency checkpoint.
- Merge low-level contracts before consumers: Task 2, then Tasks 3–5; Task 9, then Tasks 12–15.
- Resolve no conflict by choosing one side wholesale. Reconcile both tasks' acceptance criteria.
- Run focused verification after each merge and full checkpoint verification after the wave.
- Failed integration returns to the owning task; it does not expand unrelated slices.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Parallel slices assume different root commands | High | Task 1 freezes command contract before fan-out. |
| Two slices edit shared files | High | Exclusive file table; integration task owns cross-cutting edits. |
| `workspace:*` leaks into packed manifests | High | Task 2 validates release rules; Task 3 independently inspects tarballs. |
| pnpm strictness exposes undeclared imports | High | Checkpoint 1 runs every package build/test after merge. |
| Root Vitest projects select different tests | High | Task 9 freezes names/includes; Tasks 14–15 verify focused file sets. |
| Application move leaves stale paths | Medium | Task 7 updates active paths; Tasks 11 and 16 sweep separate docs; Task 17 performs global search. |
| CI setup diverges from local use | Medium | Task 10 consumes pinned version and root commands without redefining them. |
| User-owned `docs/intent/` is modified | High | It has no task owner and final status verification must show it untouched. |

## Open Questions

None. Revised task graph changes execution topology only, not approved scope or architecture.
