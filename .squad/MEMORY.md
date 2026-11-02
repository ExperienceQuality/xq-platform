# Squad Memory

This file holds canonical, human-readable knowledge for the repository. Update it during memory maintenance when durable conventions, architecture, or decisions are discovered.

## Repository map

* Monorepo under `packages/` (seven publishable `@experiencequality/*` packages) plus private `apps/` and root tooling.
* CI/release workflows live in `.github/workflows/` (`build.yml`, `test.yml` for PRs; `release.yml` for `main`).
* Release policy and architecture: `docs/release-policy.md`, `docs/architecture/github-packages-release-spec.md`.

## Conventions

* **Release flow (npm-only):** Maintainers open a manual lockstep version-bump PR (same `MAJOR.MINOR.PATCH` on all seven publishable packages). Merging to `main` runs `release.yml`, which publishes via a matrix of hub `node-publish@v2`. No bot version PR; this flow creates no new git tags or GitHub Releases.
* **Root CI scripts:** `ci:build` = `check` + `verify:versions`; `ci:test` = `node scripts/ci-test.mjs` (includes `test:release`). Each publishable package exposes `ci:publish` (`pnpm run build && pnpm publish --no-git-checks`).
* **Hub workflows:** PR `build.yml` / `test.yml` call hub `@v2` (default Node 24). Push to `main` uses `release.yml` shaped like the hub template (build → test → publish matrix); `cucumber-report` is local for Pages only.

## Architecture

* Publish target is GitHub Packages (`npm.pkg.github.com`) for the seven packages listed in `scripts/publishable-packages.mjs`. Root workspace and `apps/` are not published.
* Version alignment is enforced by `pnpm run verify:versions` (and thus by `ci:build`).

## Testing strategy

* Local/hub build gate: `pnpm run ci:build`.
* Full test suite for hub test jobs: `pnpm run ci:test` → `scripts/ci-test.mjs`.
* Release-oriented unit checks: `pnpm run test:release`.

## Lessons

* Structured records: `.squad/memory/lessons.ndjson` (wiremock/xq-infra lessons; hub v2 npm-publish release decisions).
