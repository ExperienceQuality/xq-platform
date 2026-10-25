# test-infra migration verification report

Status as of 2026-10-25. Evidence logs live under `/tmp/xq-test-infra-evidence/`
(`t14-*.log`); frozen baseline evidence under `/tmp/xq-t1-baseline/` — see
`test-infra-baseline.md` for baseline provenance.

## Environment

- Node `v24.20.0`, pnpm `12.10.0` at the workspace root, TypeScript `5.9`,
  Vitest `4`, local macOS. The shared package-verifier consumer environment
  reported pnpm `12.5.1` in its output.
- Node 26 coverage is **not** verified — no CI run is cited; only the local
  Node 24 runtime executed.

## Completed gates

| Gate              | Command                                                                                                                                                         | Result                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root check        | `pnpm run check`                                                                                                                                                | exit 0 (`t14-check.log`)                                                                                                                                                                       |
| Root test         | `pnpm test`                                                                                                                                                     | exit 0, all 7 package suites green — 251 tests total; `@experiencequality/test-infra` contributed 155 (30 loader + 23 gateway + 22 generator + 39 invoker + 20 auth + 21 CLI) (`t14-test.log`) |
| Script unit tests | `node --test scripts/verify-structure.test.mjs scripts/verify-release-version.test.mjs scripts/publish-packages.test.mjs scripts/verify-infra-package.test.mjs` | exit 0, 48/48 (`t14-node-tests.log`)                                                                                                                                                           |
| Release version   | `node scripts/verify-release-version.mjs --version 1.0.3`                                                                                                       | exit 0 — "matches all 7 publishable packages and internal dependencies" (`t14-release-version.log`)                                                                                            |

## Package verification

`pnpm run verify:packages` built all seven projects and packed seven archives
into the owned per-run directory `artifacts/packages-SAaRop/` (the T12 fix —
preexisting archives are preserved, not deleted). The six preexisting Oct-18
`artifacts/*.tgz` files were hashed before and after the run and are unchanged
(`t14-artifacts-before.sha256`). The original run was interrupted by an
environment failure after packing and the standalone infra archive/consumer
smoke; the shared multi-package consumer stage was resumed from the prepared
consumer and the already-packed archives without rebuilding or repacking, and
completed: "verified 7 archives in fresh NodeNext/Vitest and Cucumber
consumers", exit 0 (`t14-verify-packages.log`,
`t14-verify-packages-resume.log`).

## Mutation proof

A copied helper (`scripts/verify-infra-package.mjs`) with the `type ===
'module'` assertion inverted was executed in a task-owned temp directory:
`node --test` exited nonzero with the well-formed and wrong-type tests failing
(`t14-mutation.log`) — the assertion is live, not decorative. Workspace source
was not modified.

## Migration behavior notes

Upstream quirks are preserved deliberately as behavior-only parity, not newly
fixed defects: per-call signal-listener accumulation in `composeInvoker`, the
`DOCKER_CONFIG` restore-on-exit-only-when-defined leak in `registryAuth`,
dropped `options` in GitHub auth paths, and the dead outer `try/catch`. These
are recorded in `tasks/test-infra/` evidence and package tests.

## Real-Docker lifecycle (apps/infra-e2e)

Post-migration follow-up under `SPEC-test-infra-e2e.md`: the private app
`apps/infra-e2e/` drives the compiled `xq-infra` bin against a real daemon —
generate with the default gateway, `up --no-pull`, gateway-routed
`POST /messages` (writer) / `GET /messages` (reader) shared-PostgreSQL
round-trip, service-name fallback routes, `logs --tail 20`, test-container
detection (job exit `0` → CLI `0`, exit `7` → CLI `1`), and `down` with
ownership-checked volume cleanup. `pnpm run test:e2e:infra` passed 3/3 on
Docker 29.7.2 / Compose v5.4.0 (2026-10-25); per-run evidence kept under
`$TMPDIR/xq-infra-e2e-*/evidence/`; zero leftover containers/networks/volumes.

## Not verified / deferred

- Node 26 runtime — no executed evidence.
- Publication — no release, registry write, tag, commit, or push performed.
