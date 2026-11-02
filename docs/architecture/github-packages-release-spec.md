# GitHub Packages release architecture specification

**Project:** XQ Test Platform  
**Status:** Implemented architecture contract; hub `@v2` npm-only publish  
**Release strategy:** Lockstep Semantic Versioning (manual bump PR)  
**Registry:** Private GitHub Packages npm registry  
**Package scope:** `@experiencequality`

## 1. Purpose

This document defines the package management and release architecture for the XQ Platform monorepo. It adapts the approved release model to the repository's actual structure rather than requiring the example directory layout from generic references.

The repository is the source of truth, GitHub Packages is the distribution mechanism, maintainers own version bumps, and GitHub Actions (hub `@v2`) is the release-execution mechanism.

## 2. Decisions

| Area                          | Decision                                               |
| ----------------------------- | ------------------------------------------------------ |
| Repository                    | Single Git monorepo at `ExperienceQuality/xq-platform` |
| Runtime                       | Node.js 24 or newer                                    |
| Language                      | TypeScript/ESM                                         |
| Package manager               | pnpm `12.10.0` with a committed `pnpm-lock.yaml`       |
| Workspace                     | Flat `packages/*` and private `apps/*` globs           |
| Registry                      | `https://npm.pkg.github.com`                           |
| Package scope                 | `@experiencequality/*`                                 |
| Registry visibility           | Private/restricted                                     |
| Versioning                    | Lockstep SemVer; manual bump of all seven packages     |
| Release approval              | Merge of the version-bump PR to `main`                 |
| Publication                   | `release.yml` matrix of hub `node-publish@v2`          |
| Release identity              | Registry versions only; no new tags or GitHub Releases |
| Changelog                     | Frozen historical `CHANGELOG.md`; not updated by CI    |
| Report and skills publication | Separate workflows; not Node package releases          |

## 3. Repository structure

```text
xq-platform/
├── apps/
│   ├── backend-e2e/
│   ├── browser-e2e/
│   └── infra-e2e/
├── packages/
│   ├── rest-client/
│   ├── db/
│   ├── stub/
│   ├── core/
│   ├── test/
│   ├── test-browser/
│   └── test-infra/
├── scripts/
├── .github/workflows/
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── .npmrc
```

| Directory            | Responsibility                                                     |
| -------------------- | ------------------------------------------------------------------ |
| `packages/`          | Exactly the seven approved publishable product packages            |
| `apps/`              | Private showcase and E2E consumers; never published                |
| `scripts/`           | Structure, archive, registry, and version-alignment checks         |
| `.github/workflows/` | PR Build/Test and main Release automation                          |
| `docs/`              | Consumer, development, release, and architecture documentation     |

The root package and all workspaces under `apps/` remain `"private": true`. Only the explicit package inventory may publish.

## 4. Package naming and inventory

All publishable packages use the organization scope and lowercase kebab-case:

1. `@experiencequality/rest-client`
2. `@experiencequality/db`
3. `@experiencequality/stub`
4. `@experiencequality/core`
5. `@experiencequality/test`
6. `@experiencequality/test-browser`
7. `@experiencequality/test-infra`

`xq-infra` is the executable provided by `test-infra`, not an eighth package. The canonical inventory lives in `scripts/publishable-packages.mjs`; adding a publishable package requires updating that inventory, the Release publish matrix, the package-boundary map, and the repository documentation.

## 5. Lockstep versioning

All seven packages share one exact `MAJOR.MINOR.PATCH` value. Maintainers bump versions in a PR:

```sh
pnpm -r --filter "./packages/*" exec npm pkg set version=X.Y.Z
```

Root `verify:versions` (via `scripts/verify-release-version.mjs`) fails when any package version or internal dependency is misaligned. Internal source manifests keep `workspace:*`; `pnpm publish` rewrites those to the real version at publish time.

## 6. Publishable package contract

Every publishable package must have:

- A unique approved `@experiencequality/<kebab-name>` package name.
- The shared exact version.
- `"type": "module"`.
- Node engine `>=24`.
- A `build` script producing package-local `dist/`.
- A `ci:publish` script: `pnpm run build && pnpm publish --no-git-checks`.
- A `test` script.
- A `files` list containing `dist` and `package.json`.
- `publishConfig.registry` set to `https://npm.pkg.github.com`.
- Either a typed `exports["."]` entrypoint or an explicit CLI `bin` mapping.
- Internal dependencies expressed as `workspace:*` in source manifests.
- A `repository.url` pointing to `ExperienceQuality/xq-platform` and a `repository.directory` matching its package path.

Packed artifacts must contain ordinary aligned dependency versions and no unresolved `workspace:` references. `test-infra` intentionally ships only the compiled `xq-infra` CLI; it does not expose a public module entrypoint.

## 7. Authentication

GitHub Actions uses the repository `GITHUB_TOKEN` with job-scoped permissions. Publication requires `packages: write`; registry verification requires `packages: read`. Hub `node-publish` configures GitHub Packages auth for scope `@experiencequality`.

Developers and consumers use an environment-provided GitHub token with `read:packages`. Local/consumer `.npmrc` configuration routes only the organization scope:

```ini
@experiencequality:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
```

For a consumer repository's GitHub Actions workflow, grant that repository access through each package's GitHub Package settings and use its `GITHUB_TOKEN` or another approved read-only credential. No token belongs in source control.

## 8. Release lifecycle

```text
Feature PR (no version bump)
  -> Build/Test on the PR (hub @v2, Node 24)
  -> merge to main
  -> Release runs; publish jobs skip already-published versions
Bump PR sets the same version on all seven packages
  -> Build/Test + verify:versions
  -> merge bump PR to main
  -> Release build + test
  -> matrix of hub node-publish@v2 (skip if published)
  -> cucumber-report artifact for Pages
```

A manual tag does not initiate publication. No new platform tags or GitHub Releases are created. Partial publication recovery is **Re-run failed jobs**; already-published packages skip. Existing package versions are never overwritten.

## 9. Validation requirements

Pull requests must satisfy Build and Test (hub `@v2`). Publication on `main` requires Release `build` and `test`, then successful or skipped publish jobs.

Local / hub `ci:build` runs `check` and `verify:versions`. Hub `ci:test` runs `scripts/ci-test.mjs` (includes `test:release`).

## 10. Consumer contract

Consumers install explicit platform versions and keep all `@experiencequality/*` dependencies on the same version:

```json
{
  "dependencies": {
    "@experiencequality/test": "1.0.6",
    "@experiencequality/test-browser": "1.0.6",
    "@experiencequality/test-infra": "1.0.6"
  }
}
```

Production consumers pin exact versions rather than wildcards. Operational installation details live in `../consumer-guide.md`; operational retry and ownership rules live in `../release-policy.md`.
