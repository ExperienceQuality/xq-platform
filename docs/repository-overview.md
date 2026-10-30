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

Current CI has separate Build and Test workflows on PRs and main, using Node 24 and 26. The Test workflow runs packed-consumer checks, package tests, browser E2E, and Cucumber report verification. The additional release gate runs backend Docker E2E and repeats some checks; the release gate also runs the real-Docker infra E2E command.

## Current distribution flows

| Output               | Destination              | Trigger                                                                   |
| -------------------- | ------------------------ | ------------------------------------------------------------------------- |
| Seven Node packages  | GitHub Packages          | `main` push selects version/publish mode, or manual dispatch by exact SHA |
| Cucumber HTML report | GitHub Pages             | Successful main Test run or manual report selection                       |
| Agent skills         | GitHub skills publishing | Changes under `.agents/skills/` on main or manual dispatch                |

The Node release routes an exact commit through Changesets mode selection, Build, Test, release validation, package packing/publication, registry reconciliation, and platform tag/GitHub Release creation. A source version, git tag, registry version, and GitHub Release are distinct states; one does not prove the others succeeded.

The architecture contract is [architecture/github-packages-release-spec.md](architecture/github-packages-release-spec.md); the operating policy is [release-policy.md](release-policy.md). Reports and agent skills remain separate from Node package releases.

## Node release target

```text
Feature PR with changeset
  -> merge to main
  -> Changesets creates or updates a release PR
  -> maintainer reviews aligned versions and changelogs
  -> merge release PR authorizes publication
  -> validate the exact release commit
  -> build and publish packages to GitHub Packages
  -> verify every expected package/version
  -> finalize tags and GitHub release records
```

Changesets owns version preparation and changelogs. One workflow owns Node publication; manual tags do not initiate publication. All seven packages remain in one fixed-version group initially. A registry failure must not be silently treated as an unpublished version. Partial releases are recoverable only against the same immutable source commit; published versions and existing tags are never overwritten.

The package layout and APIs stay unchanged. The migration reduces overlapping release responsibilities rather than reorganizing package code. See the [implementation plan](../tasks/release-refactor/plan.md) and [task checklist](../tasks/release-refactor/todo.md).
