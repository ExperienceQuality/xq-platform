# Spec: Node.js Monorepo Restructure

## Status

Approved on 2026-10-14. Implementation remains gated by plan and task review.

## Objective

Restructure this repository into one coherent Node.js monorepo that is installed, built,
tested, validated, and released from the repository root.

The repository already uses npm workspaces, but its monorepo contract is spread across
duplicated package configuration, hard-coded orchestration, an empty package directory, and a
`showcase/` tree that behaves as an application workspace without being represented as one.
The restructure will make package ownership, dependency direction, tool configuration, and root
commands explicit while preserving consumer behavior and migrating workspace management to pnpm.

Primary users are maintainers of the test platform and engineers consuming the published
`@experiencequality/*` packages.

### Target outcomes

- One pnpm workspace rooted at the repository root.
- One root `pnpm-lock.yaml` and one root dependency installation.
- Publishable libraries under `packages/` and private runnable examples under `apps/`.
- Shared tooling owned at the root; package-local configuration only where package boundaries
  require it.
- Root commands are the canonical interface for local development and CI.
- Workspace validation discovers actual workspaces instead of duplicating an approved package
  list in several files.
- Existing package APIs, runtime behavior, package names, versions, and release policy remain
  compatible.

### Non-goals

- Merging the five published packages into one package.
- Adding Nx, Turborepo, npm workspaces, Yarn, Bun, or another orchestration/package-management
  layer beside pnpm.
- Changing product behavior, public exports, database behavior, or Cucumber/Vitest contracts.
- Changing the GitHub Packages registry or independent consumer installation behavior.
- Adding a Kafka package. The empty placeholder is removed unless a separate Kafka capability is
  specified later.
- Reworking repository-local agent skills or `docs/intent/`.

## Tech Stack

- Node.js 24 or newer; compatibility validation on Node.js 24 and 26.
- pnpm 12.10.0 workspaces, pinned through the root `packageManager` field, with a root lockfile.
- TypeScript 5.9 with ESM and `NodeNext` module resolution.
- Vitest 4 for unit and integration tests.
- ESLint 9 and Prettier 3 from root configuration.
- GitHub Actions for build, test, package verification, and release.
- GitHub Packages npm registry for published `@experiencequality/*` libraries.

No new production or monorepo-management dependency is required by this restructure.

## Commands

These root commands form the supported developer and CI interface after the restructure:

```bash
pnpm install --frozen-lockfile
pnpm run clean
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run test:e2e
pnpm run verify:structure
pnpm run verify:packages
pnpm run check
```

Command contracts:

- `pnpm run clean` removes generated build state from every workspace.
- `pnpm run build` builds publishable workspaces in dependency order through TypeScript project
  references.
- `pnpm run typecheck` checks source, tests, configuration, and private applications without
  emitting files.
- `pnpm test` runs the default unit and integration suite for publishable packages.
- `pnpm run test:e2e` runs the private backend E2E application suite and may require its documented
  PostgreSQL service.
- `pnpm run check` is the complete non-publishing quality gate used by CI.
- Workspace-local commands remain available for focused development through
  `pnpm --filter <package-name> run <script>`.

## Project Structure

Target structure:

```text
.
├── apps/
│   └── backend-e2e/          # Private executable example and end-to-end tests
├── packages/
│   ├── core/                 # Shared process, run-context, and kit composition
│   ├── db/                   # Database test utilities
│   ├── rest-client/          # HTTP test client
│   ├── stub/                 # Stub server and client
│   └── test/                 # Consumer-facing Vitest and Cucumber facade
├── scripts/                  # Root-only repository, package, and release automation
├── docs/                     # User, development, and release documentation
├── .github/workflows/        # Root-command CI and release workflows
├── eslint.config.js          # Shared lint configuration
├── pnpm-workspace.yaml       # Workspace membership and pnpm policy
├── tsconfig.base.json        # Shared TypeScript compiler policy
├── tsconfig.json             # Root project-reference build graph
├── package.json              # Package-manager pin and canonical commands
└── pnpm-lock.yaml            # Only dependency lockfile
```

Each publishable package keeps only files needed to define or ship its boundary:

```text
packages/<name>/
├── src/
├── test/
├── package.json
├── tsconfig.json
└── README.md                 # Only when package-specific consumer documentation exists
```

Package-local Vitest and test TypeScript configuration should be replaced by shared root
configuration when semantics are identical. A package-specific configuration remains only when
it expresses unique behavior, such as database lifecycle tests or facade-specific integration
test selection.

### Dependency direction

```text
rest-client ─┐
             ├─ core ─┐
stub ────────┘        ├─ test ── apps/backend-e2e
db ───────────────────┘
```

Workspace dependencies must use package names, must not cross package boundaries with relative
imports, and must remain acyclic. Internal package dependencies use pnpm's `workspace:*` protocol
so local resolution cannot silently fall back to the registry; packed package manifests must
resolve these references to the packages' exact aligned release version. Runtime dependencies
required by published packages remain in their package manifests; repository-wide development
tools remain in the root manifest.

## Code Style

Continue the existing strict ESM TypeScript style:

```ts
import type { RunContext } from './run-context.js';
import { createRunContext } from './run-context.js';

export function createKit(): { run: RunContext } {
  return { run: createRunContext() };
}
```

Conventions:

- Use strict TypeScript with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Use ESM imports and explicit `.js` extensions for relative runtime imports.
- Use `import type` for type-only dependencies.
- Use kebab-case file names and descriptive exported names.
- Keep public entry points explicit through each package's `exports` map.
- Format with single quotes, trailing commas, and a 100-column print width.
- Do not import another workspace's source or generated `dist/` files directly.

## Testing Strategy

- Unit tests live beside each workspace in `test/` and run with Vitest in the Node environment.
- Cross-component behavior remains in `packages/test/test/integration/`.
- Runnable consumer acceptance tests live in `apps/backend-e2e/test/`.
- Database-dependent tests remain explicit commands and run serially where lifecycle isolation
  requires it.
- `verify:structure` validates workspace discovery, directory class, manifest policy, dependency
  direction, root-only lockfile ownership, and absence of source boundary violations.
- `verify:packages` builds package archives and installs them into a fresh temporary consumer to
  prove published-package independence from workspace linking.
- Public export tests protect every documented entry point during the restructure.
- CI runs install, structure validation, formatting, linting, type checking, build, package tests,
  E2E/report verification, and package archive verification from root commands.
- Existing tests must pass before and after each structural migration slice. No coverage threshold
  is introduced by this restructure; existing behavioral coverage must not decrease.

## Boundaries

### Always do

- Preserve current public exports and consumer import paths.
- Preserve exact aligned versions for the five published packages.
- Keep the root package and application workspaces private.
- Keep one root `pnpm-lock.yaml` and perform installation from the repository root.
- Run structure, type, test, build, and package-consumer verification before completion.
- Update development, API, consumer, and release documentation when paths or commands change.
- Make moves with Git history preserved where practical.

### Ask first

- Add or replace dependencies.
- Merge, split, rename, add, or remove a published package.
- Change package versions, public exports, peer dependencies, engines, or registry settings.
- Change runtime behavior or test-platform contracts.
- Add a monorepo task runner or change package manager away from pnpm.
- Change CI release triggers, permissions, or publication semantics.

### Never do

- Commit credentials, registry tokens, generated `dist/`, coverage, `node_modules`, or TypeScript
  build-info files.
- Introduce a second lockfile or workspace root.
- Reach across workspace source directories with relative imports.
- Hide failing tests, weaken compiler checks, or delete tests to make the restructure pass.
- Publish private applications or the root package.
- Modify user-owned untracked `docs/intent/` content as part of this work.

## Success Criteria

1. `pnpm install --frozen-lockfile` from a clean checkout installs every workspace from the single
   root `pnpm-lock.yaml`.
2. Root `pnpm-workspace.yaml` is the single workspace-membership source; every matched directory
   contains a valid workspace manifest.
3. All five existing `@experiencequality/*` packages remain publishable at version `1.0.3` with
   unchanged export maps, engine constraints, registry, and consumer-visible behavior.
4. `showcase/backend-e2e` is moved to `apps/backend-e2e`, remains private, and passes the same E2E
   tests through its new workspace path.
5. Empty `packages/kafka-test-server` is removed; no empty or undeclared package placeholder
   remains.
6. Shared TypeScript, Vitest, ESLint, and Prettier policy is root-owned; retained package-local
   configuration has a documented package-specific reason.
7. Internal dependency graph is acyclic and matches `rest-client + stub -> core`,
   `core + db + stub + rest-client -> test`, and `test -> apps/backend-e2e`.
8. `package-lock.json` is removed; no nested lockfile, nested independent install, tracked build
   output, or tracked build-info file exists.
9. `pnpm run check`, `pnpm test`, `pnpm run test:e2e`, and `pnpm run verify:packages` pass from
   root.
10. GitHub Actions uses the same root commands and retains Node.js 24/26 validation plus current
    release behavior.
11. Documentation contains no stale `showcase/backend-e2e` path or obsolete development command.
12. A fresh temporary consumer can install produced package archives and use every supported
    public entry point without relying on workspace links.

## Approved Decisions

1. Keep five public packages rather than consolidating them.
2. Rename `showcase/` to conventional `apps/` and keep `backend-e2e` as a private workspace.
3. Remove empty `packages/kafka-test-server`; future Kafka support requires a separate spec.
4. Use pnpm 12.10.0 workspaces and TypeScript project references without Nx or Turborepo.
5. Treat public API and release behavior as compatibility constraints, not redesign targets.
