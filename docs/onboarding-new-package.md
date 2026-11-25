# Onboarding a new publishable package

Maintainer guide for adding a publishable package to this monorepo. Consumers
stay on [consumer-guide.md](consumer-guide.md); this document is for people
changing the repository allowlists and shipping a new `@experiencequality/*`
package.

Numbered checklist for adding `@experiencequality/<name>` under `packages/<name>/`.
Every new publishable package joins the lockstep version group and gets a private
`apps/<name>-e2e` (or equivalent) showcase. There is **no Changesets** workflow.

Worked example throughout: **`xq-mcp`** → `@experiencequality/xq-mcp`,
CLI bin `xq-mcp`, showcase `apps/xq-mcp-e2e`.

Two package shapes:

| Shape | Public surface | Example |
| ----- | -------------- | ------- |
| Library | Typed `exports["."]` (no `bin`) | `rest-client` |
| CLI-only | `bin` mapping, **no** `exports` | `test-infra`, `xq-mcp` |

---

## Part A — Package skeleton

1. Create `packages/<name>/` with `src/`, `test/`, `package.json`, `tsconfig.json`,
   `tsconfig.test.json`, and (for CLI packages) a local `vitest.config.ts`.
   - **xq-mcp:** CLI shape mirrored from `test-infra` (local vitest config;
     no `LICENSE` / `UPSTREAM` unless provenance requires them).
2. Set `"name": "@experiencequality/<name>"`, `"version"` equal to the current
   lockstep (today `1.0.6`), `"type": "module"`, `"engines": { "node": ">=24" }`.
3. Set `repository.url` to `https://github.com/ExperienceQuality/xq-platform.git`
   and `repository.directory` to `packages/<name>`.
4. Set `publishConfig.registry` to `https://npm.pkg.github.com`.
5. Scripts: `build` (`tsc -b`), `ci:publish` (`pnpm run build && pnpm publish --no-git-checks`),
   `check`, `test`.
6. `files` must include at least `dist` and `package.json` (plus `README.md` when
   documented).
   - **xq-mcp:** `["dist", "README.md", "package.json"]`.
7. Choose a shape:
   - **Library:** typed `exports["."]` with `types` + `import`; no `bin`.
   - **CLI:** `bin` only; delete / omit `exports`.
     - **xq-mcp:** `"xq-mcp": "./dist/bin/xq-mcp.js"` and `src/bin/xq-mcp.ts`.
8. Implement source under `src/` and unit tests under `test/`. Internal helpers may
   be exported from `src/index.ts` for local tests even when the published package
   has no `exports` field.
9. Do **not** bump the other lockstep packages when landing the new package at the
   current shared version.

---

## Part B — Allowlists and automation (B4)

Every new package must update **all** of the following:

1. `scripts/publishable-packages.mjs` — append `'<name>'`.
2. `scripts/publishable-packages.test.mjs` — expect length **N** (was 7 → **8** for
   xq-mcp) and keep directory existence checks.
3. `scripts/verify-structure.mjs` — add `'<name>': [...]` to `expectedDependencies`;
   for CLI packages add parallel asserts (bin mapping, scripts, `src/bin/<bin>.ts`,
   root tsconfig reference, root test filter) as done for `test-infra` /
   **xq-mcp**.
4. `scripts/verify-structure.test.mjs` — discover list, `FIXTURE_LIBRARIES`,
   `createLibraryManifest` CLI branch + fixture bin file, seven→eight messages,
   optional reject fixtures mirroring the CLI package.
5. Root `tsconfig.json` — append `{ "path": "./packages/<name>" }`.
6. Root `package.json` — append `--filter @experiencequality/<name>` to `test`;
   add a showcase script when applicable (`test:e2e:xq-mcp` for **xq-mcp**).
7. `scripts/ci-test.mjs` — run the new showcase E2E after `pnpm test` and before
   Cucumber/Docker when the package has a stdio/client showcase
   (`test:e2e:xq-mcp` for **xq-mcp**).
8. `.github/workflows/release.yml` — append `<name>` to the publish matrix.
9. `scripts/verify-packages.mjs` — for **CLI-only** packages (no `exports` /
   `main`), extend the packed-consumer resolve loop so the package is resolved via
   `@experiencequality/<name>/package.json` the same way `test-infra` and
   **xq-mcp** are. Libraries with typed `exports` need no change.

Also create `apps/<showcase>/` (private, never published) and document how to run
it from the root README / package README.

**Note:** Root `format:check` does **not** cover new package sources; it only
checks a fixed file list. Format package files locally as needed; do not assume
CI Prettier covers `packages/<name>/`.

Skip adding the new package to root `vitest.config.ts` when it uses a local
config (as with **xq-mcp** / `test-infra`).

---

## Part C — Verification

From the repository root (or delivery worktree):

```bash
pnpm install
pnpm run build
pnpm run verify:structure
pnpm --filter @experiencequality/<name> run test
```

For **xq-mcp**, also:

```bash
pnpm run test:e2e:xq-mcp
```

Confirm:

- Structure verifier accepts the workspace (exactly eight public libraries after
  xq-mcp).
- Package unit tests pass.
- Showcase E2E (when present) connects to the real compiled artifact.
- No accidental version bumps on the other lockstep packages.

---

## Part D — Documentation

1. Add `packages/<name>/README.md` and link it from the root README doc table when
   it is a consumer-facing surface.
2. Update seven→eight (or N→N+1) wording and inventory tables in:
   - `README.md`
   - `docs/development.md`
   - `docs/repository-overview.md`
   - `docs/release-policy.md`
   - `docs/deliverables.md`
   - `docs/architecture/github-packages-release-spec.md`
3. Link this onboarding guide from `README.md`, `docs/development.md`, and
   `docs/repository-overview.md`.
