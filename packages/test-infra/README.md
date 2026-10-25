# @experiencequality/test-infra

Docker test-environment CLI (`xq-infra`), migrated into this workspace from the
upstream `@chauhaidang/xq-test-infra` project — see `UPSTREAM.md` for provenance
and `LICENSE` for the retained Apache-2.0 text. The upstream author is credited
in `UPSTREAM.md`; migration into this scope does not transfer ownership.

The package ships a compiled CLI only. There is no public library entrypoint and
no deep-import compatibility with the upstream CommonJS source paths.

## Installation

This package is published to the company GitHub Packages npm registry under the
`@experiencequality` scope — use the existing GitHub Packages authentication
setup documented in
[`../../docs/consumer-guide.md`](../../docs/consumer-guide.md); no
package-specific credential is required.

```bash
pnpm add --save-dev @experiencequality/test-infra
```

`1.0.3` is the first platform-scope version; it has not been published yet, so
the command above applies only after the release workflow has run.

Requires Node.js 24 or newer. Docker is required only for the container
lifecycle commands (`up`, `down`, `logs`); `generate` runs without Docker. No
Vitest or TypeScript peer is needed — consumers invoke the compiled `dist` CLI.

## Usage

Run the installed bin through pnpm:

```bash
pnpm exec xq-infra --help
```

### generate

Generate `xq-compose.yml` (and `nginx-gateway.conf` when the gateway is enabled)
in the current working directory from a spec file or a directory of
`*.service.yml` files:

```bash
pnpm exec xq-infra generate -f services.yaml
pnpm exec xq-infra generate -f services.yaml --no-gateway
pnpm exec xq-infra generate -f services.yaml --keep-file
pnpm exec xq-infra generate -f services.yaml --overrides overrides.json
pnpm exec xq-infra generate -f services-dir/
```

`--overrides` takes a JSON file shaped like
`{ "services": { "<name>": { <spec fields to override> } } }`, applied
shallowly per service.

### up / down / logs

`up` reads `xq-compose.yml` from the current directory, pulls images first
(unless `--no-pull`, which skips the explicit pull step and omits the `--pull`
flag on `docker compose up`), starts services detached, detects test
containers, and waits for them — failing with exit code 1 if any test container
fails. `docker compose up` is invoked with `--remove-orphans`, so only run it in
an isolated, trusted environment:

```bash
pnpm exec xq-infra up
pnpm exec xq-infra up --no-pull
pnpm exec xq-infra down
pnpm exec xq-infra logs              # tails the last 100 lines
pnpm exec xq-infra logs -f -t 200 --timestamps web-app
```

`up`, `down`, and `logs` run real Docker commands against the compose file. Only
feed the CLI specs and compose files from trusted sources — `up` starts the
containers described by the spec.

## Spec format (minimal example)

A single-file spec maps services to image/tag/port fields; `depends_on`
references other service names, and `portRange` controls auto-assigned host
ports:

```yaml
portRange:
  start: 4100
services:
  api:
    image: node
    tag: 18-alpine
    port: 3000
    depends_on:
      - db
  db:
    image: postgres
    tag: '15'
    ports:
      - '5432:5432'
```

A directory spec instead lists one `*.service.yml` (or `*.service.yaml`) file
per service — loaded in sorted filename order — plus an optional `xq.config.yml`
(or `xq.config.yaml`) for global settings such as `portRange` and `dependencies`
(cross-service dependency groups). Services may declare `routes` to generate
gateway location blocks.

## Development

Inside this workspace, the package is a strict TypeScript (ESM, NodeNext)
project compiled to `dist/`; the shipped CLI is compiled JavaScript with no
TypeScript or Vitest runtime requirement:

```bash
pnpm --filter @experiencequality/test-infra run build   # tsc -b → dist/
pnpm --filter @experiencequality/test-infra run check   # type-check incl. tests
pnpm --filter @experiencequality/test-infra run test    # vitest run
```

## Rollback

If a consumer must move back to the previous package:

- Preflight first: confirm the previous exact version of
  `@chauhaidang/xq-test-infra` is still installable from its registry _before_
  switching a consumer to the new `@experiencequality` scope — that is what
  makes rollback possible.
- Restore the previous exact dependency pin and lockfile; the old CLI and spec
  config are unchanged by this migration.
- Do not co-install the old and new scoped packages under the same `xq-infra`
  bin name in one project.
- No automatic container, volume, or data cleanup is performed by this package
  or this migration; the upstream project remains untouched — nothing was
  archived or deprecated there.
