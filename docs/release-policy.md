# Repository and release policy

This document records the release facts evidenced by the repository
configuration and the [GitHub Packages release architecture](architecture/github-packages-release-spec.md). It also identifies decisions that still need maintainer action
rather than inferring them from workflow names or successful jobs.

## Source of truth

`main` is the source of truth for published package versions. Version bumps are
manual: a maintainer opens a PR that sets the same `MAJOR.MINOR.PATCH` on all
seven publishable packages (for example with
`pnpm -r --filter "./packages/*" exec npm pkg set version=X.Y.Z`). Root
`ci:build` fails the PR when the seven versions or their internal dependencies
are misaligned (`pnpm run verify:versions`).

Merging that PR to `main` triggers the Release workflow. Each package is
published with hub `node-publish@v2` only when that exact version is not already
in GitHub Packages. Version bumps are manual PRs only. There is no generated
Version Packages PR, no new git tags, and no new GitHub Releases. Existing
historical `vX.Y.Z` platform tags and releases stay untouched. Frozen
per-package `CHANGELOG.md` files remain as history and are not updated by this
flow.

The repository is hosted at `https://github.com/ExperienceQuality/xq-platform`.
Historical package metadata and remote names that refer to `node-test-kit` are
legacy references, not the current release endpoint.

## Packages and registry

The approved publishable set is maintained in
`scripts/publishable-packages.mjs`:

1. `@experiencequality/rest-client`
2. `@experiencequality/db`
3. `@experiencequality/stub`
4. `@experiencequality/core`
5. `@experiencequality/test`
6. `@experiencequality/test-browser`
7. `@experiencequality/test-infra`

All seven versions must remain the same `MAJOR.MINOR.PATCH` value. Their
`publishConfig` points to `https://npm.pkg.github.com`, and publication uses
the repository-provided GitHub token with `packages: write`. Each package's
`ci:publish` script runs `pnpm run build && pnpm publish --no-git-checks`. The
root workspace and `apps/` are private and are not published.

Consumers and package-repository access should use the scoped GitHub Packages
instructions in `docs/consumer-guide.md`.

## Release lifecycle

A normal release follows this path:

1. A feature PR lands on `main` without changing package versions (no publish).
2. A maintainer opens a bump PR that sets the same version on all seven
   packages and confirms `verify:versions` passes.
3. Merging the bump PR to `main` runs Release: build, test, then a matrix of
   seven hub `node-publish` jobs.
4. Already-published versions skip; new versions publish once.
5. `cucumber-report` uploads the Pages artifact; the Pages workflow deploys it.

## Validation gate

Publication waits for Release `build` and `test` (hub `@v2`). Local and hub
`ci:build` run `check` and `verify:versions`. Hub `ci:test` runs the full
suite via `scripts/ci-test.mjs` (including `test:release`). Hub `node-publish`
skips a package when `npm view` already finds that version.

## Retry and recovery

Use GitHub's **Re-run failed jobs** on the Release run. Packages that already
published skip themselves via the hub `npm view` guard. Published package
versions are never overwritten.

## Cucumber report and Pages behavior

The Release workflow uploads `artifacts/index.html` as
`cucumber-report-node-24` with seven-day retention. The Pages workflow selects
the triggering successful `main` Release run, or the latest successful `main`
Release run when manually dispatched, and publishes its report as the
site-root `index.html`.

Pull-request and failed runs do not replace the last successful Pages
deployment.

For a new repository or a repository whose Pages settings have not yet been
configured, a maintainer must open repository Settings → Pages and set the
source to **GitHub Actions**. The workflow supplies the deployment; no branch
or `/docs` source should be selected.

## Runtime support

All seven packages require Node.js 24 or newer. Vitest 4 or newer applies to
the `test` Vitest adapter; `test-browser` requires its Playwright peer
(`@playwright/test >=1.64 <2`). The compiled `test-infra` CLI has no
TypeScript or Vitest runtime requirement. The optional Cucumber peer range is
`>=13.2.1 <14`.

## Open ownership and legal decisions

No repository-wide `LICENSE` file, legal entity, maintainer contact, support
address, funding recipient, or copyright-holder statement is present in the
repository evidence reviewed for this policy. One package carries a
package-scoped license: `packages/test-infra` retains the upstream Apache-2.0
`LICENSE` and `UPSTREAM.md` provenance. Those package files do not license the
rest of the repository.

Before public distribution is considered, the maintainer should explicitly
decide the copyright holder and license, accountable release owner and support
channel, security reporting path, and whether the GitHub Packages registry and
Pages site are internal-only.

This is a decision record, not a legal recommendation.
