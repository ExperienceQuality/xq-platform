# Squad Memory

This file holds canonical, human-readable knowledge for the repository. Update it during memory maintenance when durable conventions, architecture, or decisions are discovered.

## Repository map

* Monorepo under `packages/` (eight publishable `@experiencequality/*` packages) plus private `apps/` and root tooling.
* Publishable MCP CLI package is `@experiencequality/xq-mcp` under `packages/xq-mcp/` (bin and `serverInfo.name` remain `xq-mcp`). Retired names/paths: `mcp-server`, `test-mcp`, `apps/mcp-server-e2e`. Showcase is `apps/xq-mcp-e2e` (`@experiencequality/showcase-xq-mcp-e2e`); root script `test:e2e:xq-mcp`.
* CI/release workflows live in `.github/workflows/` (`build.yml`, `test.yml` for PRs; `release.yml` for `main`).
* Release policy and architecture: `docs/release-policy.md`, `docs/architecture/github-packages-release-spec.md`.

## Conventions

* **Release flow (npm-only):** Maintainers open a manual lockstep version-bump PR (same `MAJOR.MINOR.PATCH` on all eight publishable packages). Merging to `main` runs `release.yml`, which publishes via a matrix of hub `node-publish@v2`. No bot version PR; this flow creates no new git tags or GitHub Releases.
* **Root CI scripts:** `ci:build` = `check` + `verify:versions`; `ci:test` = `node scripts/ci-test.mjs` (includes `test:release`). Each publishable package exposes `ci:publish` (`pnpm run build && pnpm publish --no-git-checks`).
* **Hub workflows:** PR `build.yml` / `test.yml` call hub `@v2` (default Node 24). Push to `main` uses `release.yml` shaped like the hub template (build → test → publish matrix); `cucumber-report` is local for Pages only.
* **Structure verify + delivery worktrees:** `scripts/verify-structure.mjs` `findExtraLockfiles` skips paths under `.squad/` so nested delivery worktree lockfiles do not fail `verify:structure`.

## Architecture

* Publish target is GitHub Packages (`npm.pkg.github.com`) for the eight packages listed in `scripts/publishable-packages.mjs` (includes `xq-mcp`; no `mcp-server` / `test-mcp`). Root workspace and `apps/` are not published.
* CLI-only publishables (`test-infra`, `xq-mcp`) ship `bin` with no `exports`; `scripts/verify-packages.mjs` resolves them via `@experiencequality/<name>/package.json`.
* Version alignment is enforced by `pnpm run verify:versions` (and thus by `ci:build`).

## Testing strategy

* Local/hub build gate: `pnpm run ci:build`.
* Full test suite for hub test jobs: `pnpm run ci:test` → `scripts/ci-test.mjs`.
* Release-oriented unit checks: `pnpm run test:release`.

## Lessons

* Structured records: `.squad/memory/lessons.ndjson` (wiremock/xq-infra lessons; hub v2 npm-publish release decisions; xq-mcp rename superseding test-mcp paths; verify-structure `.squad/` lockfile skip).
