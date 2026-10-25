# Baseline evidence: upstream xq-test-infra (task T1)

**Date captured:** 2026-10-25 (UTC)
**Status:** Complete — no test failures observed; baseline is evidence only and does not prove target parity.

## 1. Source identity and provenance

- Repository: `chauhaidang/xq-test-infra` (read-only `gh api` access)
- Pinned commit: `3d74803af7b71c9e946523ac7dd6d6e695cc8f07`
- Upstream manifest identity: `@chauhaidang/xq-test-infra@1.0.3`, license Apache-2.0
- Archive (tarball via `gh api repos/.../tarball/<sha>`): `/tmp/xq-t1-baseline/xq-test-infra-3d74803.tar.gz`
  - sha256 `e5aa8870e5e7c3699d0ba933f87a69e438c95954620ea75d5bf57bce7ba4c130`
- Pristine manifest sha256 `d8f110da9a13597e096453cd07bdc10fe4001c6714b7340d93c5151c0965296c` (`/tmp/xq-t1-baseline/pristine/chauhaidang-xq-test-infra-3d74803/package.json`)
- `LICENSE` sha256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` (identical in pristine and baseline)
- Source/test file sha256s (identical in pristine and baseline — runtime sources unmodified):

| File | sha256 |
| --- | --- |
| `bin/xq-infra.js` | `f2fa593f04b1b1a7a9c63e90b4ac6132bd96ee47eb9b5675894c6441bbae0620` |
| `src/cli/index.js` | `095ff40babf74ab1e3a212abf0c60edf04127f76fe0033cf41338c378a0bfaad` |
| `src/services/composeGenerator.js` | `86df55cf712b5a835d70f796fb520b43ba56f45eeb9741ea72e706c3e4266746` |
| `src/services/composeInvoker.js` | `8d9899d0786cb74059d1ccd499971fd0f994a2e6181f570ea19fd233db89da11` |
| `src/services/gateway.js` | `a68ab915232eff5dce9b1d172bae0b7d3d0ff07ca7f25a8ca75a8bfb5e8a539a` |
| `src/services/registryAuth.js` | `1c541341a1262123346ca0d9b40d67d4ed74d8a6f7011df9e7189e8d32984db9` |
| `src/services/serviceLoader.js` | `da9ec629dcf828bcccde50db19f401c9ba2116cc36e1615de7415e564c44a4af` |
| `tests/composeGenerator.test.js` | `253f138807d78674172e9eb0e11385c42e66dfdf8b01f26caae22989ab13bbb9` |
| `tests/composeInvoker.test.js` | `7b6781708c9f632c504d166dd01cf735a2b8eae5d4aa021fd26995613f401118` |
| `tests/gateway.test.js` | `f69a7f4dd83c9dd73a7a45cf78428dfe702bfabf38fce4486243ff9b97bce800` |
| `tests/integration.test.js` | `a30ae54163a775491a18f11b2ecd95960dd2c8c016be6504af42311188e9331f` |
| `tests/serviceLoader.test.js` | `7e40c8bb3884cf3f56f6a2978b5a3bf3e29b96b5e628f6b9c12e579c504fe462` |

## 2. Evidence layout (task-owned, left on disk)

- `/tmp/xq-t1-baseline/pristine/chauhaidang-xq-test-infra-3d74803/` — untouched extracted archive.
- `/tmp/xq-t1-baseline/baseline/` — working copy used for install and test runs (adapted, see §3).
- `/tmp/xq-t1-baseline/evidence/` — `npm-install.log`, `jest-unit.log`, `jest-integration-cli.log`, `fixtures/` (per-case `run.log` plus raw generated `xq-compose.yml` / `nginx-gateway.conf`).
- `/tmp/xq-t1-baseline/work/` — private per-case working directories (`help`, `version`, `gen-single`, `gen-single-nogw`, `gen-dir`, `gen-overrides`, `gen-missing`, `gen-bad-override`), each retaining its `run.log` and any generated files.
- `/tmp/xq-t1-baseline/npmrc.upstream-quarantined` — upstream `.npmrc` moved out of the baseline copy; contents never inspected or printed.

## 3. Baseline-copy adaptations (temporary copy only; upstream untouched)

1. Removed `"@chauhaidang/xq-js-common-kit": "1.0.6"` from `baseline/package.json` dependencies. Justification: `grep -rn "xq-js-common-kit" src bin tests` found zero references — the dependency is declared but unused by all shipped runtime and test files. Removing it avoids a private-registry fetch. Documented here per plan.
2. Deleted upstream `package-lock.json` (contained the removed private dep); `npm install` regenerated a fresh lockfile in the baseline copy.
3. Moved upstream `.npmrc` out of the baseline copy (it contains 1 auth-related line; contents not inspected or printed). This avoids private-registry configuration during install.
4. Upstream `.npmrc`, `package-lock.json`, and `package.json` remain intact in the pristine tree. `diff -r` between pristine and baseline shows no other content changes besides npm-generated `node_modules/`/`package-lock.json` and test-written outputs (§6).

Manifest scripts were left in place but no package lifecycle scripts were executed (`--ignore-scripts`).

## 4. Install and runtime environment

- Node `v24.20.0`, npm `11.19.0`, macOS. (Upstream README documents Node 18/20; baseline ran on the platform's Node 24 — see limitations.)
- Command: `npm install --ignore-scripts` in `/tmp/xq-t1-baseline/baseline` → **exit 0**, 365 packages added. Log: `/tmp/xq-t1-baseline/evidence/npm-install.log`.
- Install warnings (non-fatal): deprecated `glob@10.5.0`, `uuid@9.0.1`, `eslint@8.57.1`; 1 moderate severity vulnerability reported by audit. No action taken.

## 5. Baseline test runs (exact commands, logs, exit statuses)

Run 1 — unit suites (log: `/tmp/xq-t1-baseline/evidence/jest-unit.log`):

```bash
npx --no-install jest --runInBand tests/composeGenerator.test.js tests/composeInvoker.test.js tests/gateway.test.js tests/serviceLoader.test.js
```

- **Exit 0.** `Test Suites: 4 passed, 4 total` · `Tests: 102 passed, 102 total` · `Snapshots: 0`.
- Observation: `MaxListenersExceededWarning` — "11 SIGINT listeners" and "11 SIGTERM listeners added to [process]" (`jest-unit.log` lines 5–7). Confirms the process-listener accumulation the spec's test-isolation rules target.

Run 2 — filtered integration CLI assertions (log: `/tmp/xq-t1-baseline/evidence/jest-integration-cli.log`):

```bash
npx --no-install jest --runInBand tests/integration.test.js --testNamePattern='CLI Commands|Override functionality'
```

- **Exit 0.** `Tests: 4 skipped, 8 passed, 12 total`.
- Passed: help, version, generate compose, generate without gateway, invalid spec fail, missing spec fail, apply JSON overrides, invalid overrides fail.
- Skipped (as required): all 4 `Docker Integration` tests — no Docker lifecycle was executed. No `docker --version` probe output appears in the logs.

No test failures occurred, so there are no failing assertions to record. Both commands completed within the 240 s watchdog bound; no timeouts, no `--forceExit` used.

## 6. CLI fixture runs (unchanged upstream bin, private working dirs)

Each case ran `node /tmp/xq-t1-baseline/baseline/bin/xq-infra.js …` from its own `/tmp/xq-t1-baseline/work/<case>/` directory; raw `run.log` and generated files are preserved there and copied under `evidence/fixtures/<case>/`. No normalization was applied — raw files/paths preserved; equivalence normalization is deferred to lead review.

| Case | Command (args) | Exit | Artifacts |
| --- | --- | --- | --- |
| help | `--help` | 0 | `run.log` |
| version | `--version` | 0 | `run.log` (prints `1.0.3`) |
| gen-single | `generate -f basic-web-app.yaml` | 0 | `xq-compose.yml`, `nginx-gateway.conf` |
| gen-single-nogw | `generate -f basic-web-app.yaml --no-gateway` | 0 | `xq-compose.yml` (no nginx conf) |
| gen-dir | `generate -f .` (multi-service dir incl. `xq.config.yml`) | 0 | `xq-compose.yml`, `nginx-gateway.conf` |
| gen-overrides | `generate -f basic-web-app.yaml --overrides dev-overrides.json` | 0 | `xq-compose.yml`, `nginx-gateway.conf` |
| gen-missing | `generate -f missing.yaml` | 2 | `run.log` |
| gen-bad-override | `generate -f basic-web-app.yaml --overrides bad.json` (malformed JSON) | 2 | `run.log` |

Observed side effect: the filtered integration test run left `xq-compose.yml` and `nginx-gateway.conf` in the baseline copy root (`process.cwd()`), confirming the cwd-singleton write behavior the plan's temp-cwd isolation targets. These are test artifacts inside the task-owned copy only.

Note: upstream loads `--overrides` via `require()` (`src/cli/index.js:24`), which the port replaces with `fs` read + `JSON.parse` per spec while preserving the exit-2 error path shown by `gen-bad-override`.

## 7. Limitations

- Baseline ran on Node 24, not upstream's documented 18/20.
- Dependencies resolved fresh (no upstream lockfile reused after the private dep removal); installed versions may differ from any historical upstream install.
- No Docker lifecycle, registry login, or image pulls were performed; Docker Integration tests were skipped by filter, not executed.
- `@chauhaidang/xq-js-common-kit` was omitted after confirming zero runtime/test references; if a hidden reference existed, baseline coverage would miss it (none found).
- Passing baseline ≠ target parity proven; these outputs are the frozen reference for later equivalence checks.
- No raw third-party source or Jest lockfiles are committed to this repo; evidence lives in the task-owned `/tmp/xq-t1-baseline/` paths referenced above.
