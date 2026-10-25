# Upstream

- Source repository: <https://github.com/chauhaidang/xq-test-infra>
- Pinned commit: `3d74803af7b71c9e946523ac7dd6d6e695cc8f07`
- Original package identity: `@chauhaidang/xq-test-infra@1.0.3`
- Original author: `chauhaidang`
- License: Apache-2.0 (see `LICENSE`)

## Migration-only adjustments

- Package renamed to `@experiencequality/test-infra` and prepared for the company GitHub Packages registry; no release was performed by the migration.
- Runtime rewritten from CommonJS JavaScript to strict TypeScript (ESM, NodeNext); tests ported to Vitest.
- The declared-but-unused upstream dependency `@chauhaidang/xq-js-common-kit@1.0.6` was omitted after confirming zero runtime references — see `docs/migrations/test-infra-baseline.md`.
- Upstream ESLint 8 config, npm lockfiles, `.npmrc`, CI workflows, and demos (`todo-app`, `env-registry`, `examples`) are not part of this package.
- Minimum Node version raised to `>=24` per platform policy (upstream documented Node 18/20).
- Upstream internal module paths were not preserved; deep-import compatibility is not guaranteed — the CLI contract is the compatibility boundary.
