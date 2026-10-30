# Development and release checks

All package source, tests, and the E2E example are TypeScript. Install from the
repository root.

```bash
pnpm install
pnpm run check
pnpm test
pnpm run build
```

The workspace layout is enforced by `scripts/verify-structure.mjs`. Package
archives are built and tested in a fresh temporary consumer by
`scripts/verify-packages.mjs`:

```bash
pnpm run verify:structure
pnpm run verify:packages
```

Build output goes to each package's ignored `dist/` directory. Archive checks
are validation only; they do not publish packages. Each archive-check run packs
into a new `artifacts/packages-<random>/` subdirectory, so earlier run outputs
and preexisting archives are preserved rather than overwritten.

The internal release packages are:

- `@experiencequality/rest-client`
- `@experiencequality/db`
- `@experiencequality/stub`
- `@experiencequality/core`
- `@experiencequality/test`
- `@experiencequality/test-browser`
- `@experiencequality/test-infra`

The root workspace and `apps/` remain private. The seven publishable packages
stay in one fixed `MAJOR.MINOR.PATCH` group, with exact internal dependencies
aligned automatically by Changesets. Packages are published to the company
GitHub Packages npm registry, not the public npm registry. Contributors record
consumer-facing release intent with `pnpm changeset`; package source, tests,
configs, and manifest changes require a changeset in pull requests unless they
are documentation-only or the generated release branch. Maintainers can inspect
pending releases with `pnpm run changeset:status`. Merging a generated Version
Packages PR authorizes the release workflow to validate and publish the exact
merge commit. The package contract requires Node.js 24 or newer, Vitest 4 or
newer, and `@cucumber/cucumber` 13.2.x when the optional Cucumber integration
is used.

`@experiencequality/test-infra` is a TypeScript source package compiled to ESM
in `dist/` and built through the root project reference; it ships a compiled
`xq-infra` CLI and needs no TypeScript or Vitest runtime in the consumer. It has
no public module entrypoint and no deep-import compatibility guarantee. Unit
tests mock spawned processes, while CLI tests execute the real compiled bin in
a subprocess and the archive verifier exercises an installed-package consumer
(which downloads the package's npm dependencies) — none of it needs a Docker
daemon or a container-registry login:

```bash
pnpm --filter @experiencequality/test-infra run test
pnpm --filter @experiencequality/test-infra exec vitest run --config vitest.config.ts test/cli.test.ts
node scripts/verify-infra-package.mjs --archive <absolute-tarball-path> --consumer-smoke
```

## Cucumber report and CI publication

The supported report contract is implemented by the consumer-facing
`defineCucumberConfig` helper. It keeps `progress` output enabled and always
configures an HTML report. The default is the consumer-relative path
`artifacts/index.html`; a nonblank `reportPath` can select another
consumer-relative path. Blank or missing values use the default. Absolute
paths and `..` traversal that escapes the consumer workspace are rejected.
This guarantee applies at the helper boundary only; a hand-written
`cucumber-js` configuration or direct CLI formatter selection is outside the
platform's enforcement boundary.

The Test workflow runs on Node.js 24 and 26 and uploads the Node 24
`artifacts/index.html` report as the `cucumber-report-node-24` artifact with
`if: always()` and seven-day retention. Node 26 provides compatibility
coverage; Node 24 is the canonical report selected by Pages. A failed run
remains diagnosable through its downloadable artifact. The GitHub Pages
workflow is main-only: it publishes the latest successful Test report from
`main` as the site-root `index.html`. Failed, pull-request, and release-tag
runs do not replace the last successful Pages deployment.

### GitHub Pages setup

The Pages workflow requires a one-time repository setting that cannot be
enabled by workflow YAML. In the repository settings, open **Pages**, choose
**GitHub Actions** as the build and deployment source, and ensure the
`github-pages` environment exists with its deployment protection rules set as
intended. The workflow grants `pages: write` and `id-token: write` only to its
deployment job. If this setting is missing, `actions/deploy-pages` fails with a
404 even when the report artifact was prepared successfully.

### Idempotent package publication and recovery

The release workflow verifies that all seven package manifests and internal
dependency ranges remain aligned before publication. Changesets publishes the
missing planned packages; the release succeeds only after every expected
package/version is confirmed in GitHub Packages and the single platform
tag/GitHub Release exists. Partial package publication can be resumed from the
same immutable `release_sha`; release-record failures use the manual
`finalize_only` path. Authentication, permission, network, or malformed
registry responses fail closed and are never treated as missing packages.
