# Repository Overview

## Purpose

XQ Platform is a private pnpm monorepo for reusable backend and browser testing packages and a Docker test-environment CLI. It is not a single deployed application. This document separates the current structure from the repository structure and its implemented release target.

## Four areas

| Area          | Location                                     | Responsibility                                      |
| ------------- | -------------------------------------------- | --------------------------------------------------- |
| Product       | `packages/`                                  | Seven distributable Node packages                   |
| Verification  | Package tests, `apps/`, verification scripts | Prove source, archives, and consumer workflows work |
| Automation    | `.github/workflows/`                         | Execute validation and coordinate distribution      |
| Documentation | `docs/`, package READMEs                     | Consumer usage and maintainer decisions             |

The root and apps are private. pnpm discovers `packages/*` and `apps/*`; root TypeScript project references build the seven product packages. Build output is package-local `dist/`.

## Product boundaries

| Package under `@experiencequality/` | Role                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `rest-client`                       | Pactum-backed HTTP requests and exchange capture               |
| `db`                                | PostgreSQL access using Kysely and pg                          |
| `stub`                              | Pactum mock service and interaction lifecycle                  |
| `core`                              | Shared run context and backend/HTTP/stub lifecycle composition |
| `test`                              | Backend facade with Vitest and optional Cucumber integration   |
| `test-browser`                      | Playwright facade using the shared testing capabilities        |
| `test-infra`                        | Compiled `xq-infra` CLI for Docker test environments           |

`core` depends on `rest-client` and `stub`. Both test facades depend on `core`, `db`, `rest-client`, and `stub`. `test-infra` has no internal package dependencies: it supports environment setup rather than the facade runtime. `xq-infra` is its executable, not another package.

## Verification

- Structure checks enforce approved workspaces and dependency boundaries.
- Lint, formatting, types, and compilation check source consistency.
- Package tests exercise individual packages.
- Packed-consumer checks install archives into temporary consumers to detect problems hidden by workspace links.
- `apps/backend-e2e`, `apps/browser-e2e`, and `apps/infra-e2e` are private consumer examples and E2E verification projects, not shipping applications.

Pull-request CI uses separate Build and Test workflows (hub `@v2`). Push to `main` runs Release: hub build and test, a per-package publish matrix (hub skips versions already in the registry), and a Cucumber report artifact for Pages. Hub `ci:test` covers packed-consumer checks, package tests, browser E2E, backend Docker E2E, real-Docker infra E2E, and Cucumber verification.

## Current distribution flows

| Output               | Destination              | Trigger                                                                   |
| -------------------- | ------------------------ | ------------------------------------------------------------------------- |
| Seven Node packages  | GitHub Packages          | Manual version-bump PR; merge to `main` publishes unpublished versions    |
| Cucumber HTML report | GitHub Pages             | Successful main Release run or manual report selection                    |
| Agent skills         | GitHub skills publishing | Changes under `.agents/skills/` on main or manual dispatch                |

The Node release path is: bump all seven package versions in a PR, merge to
`main`, then Release runs build, test, per-package hub publish (skip if already
published), and registry verification. No new git tags and no new GitHub
Releases. Frozen `CHANGELOG.md` files stay as history.

The architecture contract is [architecture/github-packages-release-spec.md](architecture/github-packages-release-spec.md); the operating policy is [release-policy.md](release-policy.md). Reports and agent skills remain separate from Node package releases.

## Node release target

```text
Feature PR (no version change)
  -> merge to main (Release skips already-published versions)
Bump PR sets the same version on all seven packages
  -> verify:versions passes on the PR
  -> merge bump PR to main
  -> Release build + test
  -> matrix publish via hub node-publish@v2
```

Maintainers own version preparation. One Release workflow owns Node
publication. All seven packages remain in one fixed-version group. A registry
failure must not be silently treated as an unpublished version. Recovery is
**Re-run failed jobs**; published versions are never overwritten.

The package layout and APIs stay unchanged. See the [implementation plan](../tasks/release-refactor/plan.md) and [task checklist](../tasks/release-refactor/todo.md).
