# Repository and release policy

This document records the release facts evidenced by the repository
configuration and the [GitHub Packages release architecture](architecture/github-packages-release-spec.md). It also identifies decisions that still need maintainer action
rather than inferring them from workflow names or successful jobs.

## Source of truth

`main` is the source of truth for release preparation. A feature change that
affects consumers should include a changeset. The Node release workflow runs on
`main`, inspects the exact commit that triggered it, and uses Changesets in one
of three modes:

- `version`: pending changesets create or update the Version Packages release
  PR.
- `publish`: a release commit with unpublished package versions runs the full
  validation gate, publishes packages, verifies the registry, and creates the
  platform release records.
- `finalize` (manual only): registry verification and platform tag/release
  creation can be rerun for an exact commit without republishing packages.

Manual tags do not trigger publication. Platform release tags use
`vMAJOR.MINOR.PATCH` and are created only after all expected package versions
are confirmed in GitHub Packages.

The repository is hosted at `https://github.com/ExperienceQuality/xq-platform`.
Historical package metadata and remote names that refer to `node-test-kit` are
legacy references, not the current release endpoint.

## Packages and registry

The approved publishable set is maintained in
`scripts/publishable-packages.mjs` and mirrors the fixed Changesets group:

1. `@experiencequality/rest-client`
2. `@experiencequality/db`
3. `@experiencequality/stub`
4. `@experiencequality/core`
5. `@experiencequality/test`
6. `@experiencequality/test-browser`
7. `@experiencequality/test-infra`

All seven versions must remain the same `MAJOR.MINOR.PATCH` value. Their
`publishConfig` points to `https://npm.pkg.github.com`, and publication uses
the repository-provided GitHub token with `packages: write`. The root
workspace and `apps/` are private and are not published.

Consumers and package-repository access should use the scoped GitHub Packages
instructions in `docs/consumer-guide.md`.

## Release lifecycle

A normal release follows this path:

1. A feature PR includes code, tests, and a changeset.
2. Merging to `main` triggers the Node release workflow in `version` mode.
3. The Version Packages PR contains aligned manifests, internal dependency
   updates, and package changelogs. A maintainer reviews it and manually runs
   Build and Test against its branch because the default workflow token does
   not automatically trigger normal PR checks.
4. Merging the release PR to `main` triggers `publish` mode against the exact
   merge commit.
5. Build, Test, release validation, package packing, publication, and registry
   verification must all pass.
6. The workflow creates one annotated `vMAJOR.MINOR.PATCH` tag and one GitHub
   Release. It does not create seven package-scoped tags or releases.

The first Changesets-managed release is intended to be `1.0.5`.

## Validation gate

Publication must wait for all of the following:

- Build workflow checks, including lint, structure verification, formatting,
  release-script tests, compilation, and package checks on Node 24 and 26.
- Test workflow checks, including packed-consumer tests, package tests,
  browser E2E, and Cucumber report verification on Node 24 and 26.
- `pnpm run ci:release` on the exact release commit. This includes repository
  checks, package tests, Cucumber validation, backend Docker E2E, browser E2E,
  real-Docker infra E2E, and packed-package verification.
- Post-publication lookup of every expected package/version in GitHub
  Packages.

A registry authorization, permission, malformed-response, network, or unknown
lookup failure must fail the release. It must not be interpreted as a missing
package.

## Retry and recovery

Use the failed stage to choose recovery:

- For Build, Test, or release-gate failures, fix the source or workflow issue
  and merge the correction before release.
- For a partial package publication, rerun Node release with the exact
  `release_sha` and `finalize_only: false`. Changesets plans the remaining
  unpublished packages; the workflow then verifies all seven expected versions.
- For publication that succeeded but failed while creating the tag or GitHub
  Release, rerun Node release manually with `release_sha` set to the same
  immutable commit and `finalize_only: true`.
- If a `vMAJOR.MINOR.PATCH` tag already points at a different commit, the
  workflow refuses to move it. Use a new version instead.
- Published package versions and tags are never overwritten.

## Cucumber report and Pages behavior

The Test workflow uploads `artifacts/index.html` on both success and failure,
with seven-day retention. The Pages workflow selects the triggering successful
`main` Test run, or the latest successful `main` run when manually dispatched,
and publishes its report as the site-root `index.html`.

Pull-request and failed runs do not replace the last successful Pages
deployment. Release validation reports remain workflow artifacts and do not
publish Pages output.

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
