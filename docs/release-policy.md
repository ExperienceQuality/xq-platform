# Repository and release policy

This document records the release facts that are evidenced by the repository
configuration. It also calls out decisions that still need an explicit
maintainer or legal owner instead of assigning one by inference.

## Source of truth

`main` is the source of truth for release preparation. The build and test
workflows accept an explicit ref, and the release workflow routes a release tag
through those workflows before publication. Release tags must be
`vMAJOR.MINOR.PATCH`, for example `v1.0.3`, and the tag should be cut from the
commit on `main` that the release PR merged.

The repository is hosted at
`https://github.com/ExperienceQuality/node-test-kit`. The root workspace and
each publishable package now expose that repository URL in their npm metadata;
package metadata also identifies its workspace directory.

## Packages and registry

The publishable set is the five `@experiencequality/*` packages:

1. `@experiencequality/rest-client`
2. `@experiencequality/db`
3. `@experiencequality/stub`
4. `@experiencequality/core`
5. `@experiencequality/test`

All five versions must remain the same `MAJOR.MINOR.PATCH` value. Their
`publishConfig` points to `https://npm.pkg.github.com`, and the publish job
uses the repository-provided GitHub token with `packages: write`. The root
workspace and `apps/backend-e2e` are private and are not published.

The current repository evidence identifies GitHub Packages as the company
registry, but does not identify a public npm distribution policy. Consumers
should therefore use the scoped GitHub Packages instructions in
`docs/consumer-guide.md`.

## Publication order

After the release tag passes routing, build, test, release-gate, and package
verification, the publish job runs these commands in order:

```text
@experiencequality/rest-client
@experiencequality/db
@experiencequality/stub
@experiencequality/core
@experiencequality/test
```

The order follows the dependency graph: `core` depends on `rest-client` and
`stub`, while `test` depends on `core`, `db`, `rest-client`, and `stub`. The
workflow builds before publishing and does not publish the root workspace or
`apps/backend-e2e`.

## Retry and recovery

Use the failed job's stage to choose the recovery:

- For routing, build, test, or release-gate failures, fix the source or
  workflow issue, merge the correction to `main`, and create a new patch tag.
- For a failed release validation that did not publish packages, the workflow
  supports manual dispatch with the existing release tag. Confirm that the
  tag still identifies the intended commit before retrying.
- If publication fails after one or more packages have been accepted, do not
  blindly rerun the same version. First record which package versions were
  accepted in GitHub Packages, then ask the release maintainer to decide
  whether the remaining packages can be completed or whether a new patch
  version is required. The repository does not yet provide an automated
  resume ledger for partial publication.
- A failed release-gate report is uploaded for diagnosis. It does not change
  the Pages site because Pages selects only successful `main` test runs.

These recovery rules describe the current workflow shape. The exact owner and
approval path for partial publication is still an open maintainer decision.

## Cucumber report and Pages behavior

The test workflow uploads `artifacts/index.html` on both success and failure,
with seven-day retention. The Pages workflow selects the triggering successful
`main` test run, or the latest successful `main` run when manually dispatched,
and publishes its report as the site-root `index.html`.

Pull-request runs, release-tag runs, and failed runs do not replace the last
successful `main` Pages deployment. A failed run remains available through its
workflow artifact for diagnosis.

For a new repository or a repository whose Pages settings have not yet been
configured, a maintainer must open GitHub repository Settings → Pages and set
the source to **GitHub Actions**. The workflow supplies the deployment; no
branch or `/docs` source should be selected. The repository evidence does not
identify the intended public Pages hostname, so this document deliberately
does not assert one.

## Runtime support

The current package contract requires Node.js 24 or newer and Vitest 4 or
newer. The optional Cucumber peer range is `>=13.2.1 <14`.

## Open ownership and legal decisions

No `LICENSE` file, legal entity, maintainer contact, support address, funding
recipient, or copyright-holder statement is present in the repository evidence
reviewed for this policy. Those fields remain intentionally unset. Before a
public distribution is considered, the maintainer should explicitly decide:

- the copyright holder and license to add;
- the accountable engineering/release owner and support channel;
- whether a security reporting channel is required;
- whether the GitHub Packages registry and Pages site are internal-only or
  may be exposed outside the company.

This is a decision record, not a legal recommendation.
