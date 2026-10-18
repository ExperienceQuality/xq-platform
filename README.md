# xq-test-platform

Vitest-based foundation for backend functional and API E2E testing.

The repository is a private pnpm workspace containing six internal consumer
packages. Consumer-facing packages and platform documentation are split into
focused documents:

| Topic                                     | Documentation                                      |
| ----------------------------------------- | -------------------------------------------------- |
| What this project delivers                | [docs/deliverables.md](docs/deliverables.md)       |
| Node/Vitest test facade usage             | [docs/test.md](docs/test.md)                       |
| Node Cucumber consumer guide              | [docs/consumer-guide.md](docs/consumer-guide.md)   |
| TypeScript development and release checks | [docs/development.md](docs/development.md)         |
| Node test package internals               | [packages/test/README.md](packages/test/README.md) |
| Playwright browser test package           | [packages/test-browser/README.md](packages/test-browser/README.md) |
| Release and repository policy             | [docs/release-policy.md](docs/release-policy.md)   |

## Quick start

Install dependencies and validate the workspace:

```bash
pnpm install
pnpm run check
pnpm test
```

For the backend test kit, start with:

```ts
import { defineConfig } from '@experiencequality/test/vitest/config';

export default defineConfig({
  application: { url: 'http://127.0.0.1:4000/health' },
});
```

```ts
import { test } from '@experiencequality/test/vitest';

test('uses the platform-owned kit fixture', async ({ kit }) => {
  console.log(kit.rest, kit.stub, kit.run);
});
```

Complete API reference with consumer examples: [docs/api.md](docs/api.md).

## Cucumber reports in CI

For Cucumber consumers, use `defineCucumberConfig` to receive the supported
report contract: `progress` remains available in the console and an HTML
report is always generated. The default consumer-relative path is
`artifacts/index.html`; pass a nonblank relative `reportPath` to customize it.
Blank or missing values use the default, while absolute paths and traversal
outside the consumer workspace are rejected. This enforcement applies to the
helper, not to hand-written Cucumber configuration or direct CLI formatter
selection.

The Test workflow uploads `artifacts/index.html` as `cucumber-report` on both
successful and failed runs, with seven-day retention. GitHub Pages is sourced
only from successful Test runs on `main` and publishes the latest report as
`index.html` at the site root. Failed runs keep their artifact for diagnosis
but do not replace the last successful Pages report.

The current publishable package release is `1.0.3`. The six internal
`@experiencequality/*` packages are released together at one exact
`MAJOR.MINOR.PATCH` version from the private workspace and published to the
company GitHub Packages npm registry; the root workspace and `apps/` are not
published.
