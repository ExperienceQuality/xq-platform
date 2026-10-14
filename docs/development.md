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
are validation only; they do not publish packages.

## Scaffold a workspace

Use the guarded scaffold command to create a conventional package or private app:

```bash
pnpm scaffold --type package --name billing-client
pnpm scaffold --type app --name billing-e2e
```

Names must use kebab-case. The command refuses to overwrite an existing directory and creates
the manifest, source, test, and TypeScript configuration files. It does not modify root build,
test, release, or dependency-graph contracts; review those integration points before committing
the new workspace.

The internal release packages are:

- `@experiencequality/rest-client`
- `@experiencequality/db`
- `@experiencequality/stub`
- `@experiencequality/core`
- `@experiencequality/test`

The root workspace and `apps/backend-e2e` remain private. The five publishable packages
currently use version `1.0.3`; release all five internal packages at the same
`MAJOR.MINOR.PATCH` version, and keep their internal dependency versions exact
and aligned. Packages are published to the company GitHub Packages npm
registry, not the public npm registry. The release workflow uses the
repository `GITHUB_TOKEN`; push a `vMAJOR.MINOR.PATCH` tag from `main` after
the release PR is merged. The current package contract requires Node.js 24 or
newer, Vitest 4 or newer, and `@cucumber/cucumber` 13.2.x when the optional
Cucumber integration is used.

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

### Idempotent package publication

The release workflow verifies that all five package manifests and internal
dependency ranges match the routed tag version before publication. Its publish
step checks each exact package/version in dependency order, skips versions
already present in GitHub Packages, and publishes only missing versions. A
local version mismatch or an npm registry/authentication error fails the
release; it is never treated as a missing package.
