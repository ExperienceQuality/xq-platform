# Implementation Plan: @experiencequality/test-browser

## Status

Approved on 2026-10-18. Implements `SPEC-playwright.md`.

## Overview

Add a sixth published package, `@experiencequality/test-browser`, that mirrors the
`@experiencequality/test` Vitest facade for Playwright: a `./config` `defineConfig`
wrapper with XQ-enforced defaults plus kit options, a `globalSetup` that owns the
pactum mock + backend lifecycle, a `test`/`expect` entry point exposing the `kit`
fixture, and a private `apps/browser-e2e` consumer proving the facade end-to-end.

Detailed acceptance criteria live in `tasks/todo.md`.

## Architecture Decisions

- New workspace `packages/test-browser` with exports `.` (test fixture entry) and
  `./config` (config entry). Aligned version with the other five packages.
- `@playwright/test` is a peer dependency (`>=1.64 <2`); consumers pin their own.
- Playwright `globalSetup` runs in a separate process and workers cannot `inject()`;
  the kit payload (`mock` endpoints, `backendUrl`, `databases`) is serialized into a
  `NODE_TEST_KIT` env var by `config.ts`, consumed by `global-setup.ts`, and forwarded
  to workers. `src/context.ts` owns encode/decode.
- `createRunContext` in core already accepts a duck-typed `{id}` task and env-backed
  metadata — no core change. `src/run-context.ts` adapts Playwright `TestInfo`
  (`testId`, `workerIndex`) to that signature inside test-browser.
- Enforced Playwright defaults: `fullyParallel: true`, `retries: 0`, reporter =
  single-file HTML (exact reporter option verified at implementation — target
  `['html', { outputFile: 'playwright-report.html', open: 'never' }]`, fallback to an
  `outputFolder` report if the option does not exist at the pinned peer range),
  `screenshot/trace/video` on failure. Consumers may override `use`, `projects`,
  `testDir`, `webServer`.
- `projects`/viewport matrix is consumer choice — package ships no presets.
- Kit `application` lifecycle owns the backend via `startBackend` in global setup;
  consumer `webServer` passes through for Playwright-native serving.
- `apps/browser-e2e` is private; it needs Chromium installed (`playwright install
  chromium`) in CI — approved.

## Dependency Graph

```text
T1 scaffold (contract: package shape, tsconfig refs, root scripts)
    │
    ├── T2 context.ts env codec          ─┐
    ├── T3 run-context.ts adapter          ├─ parallel wave A
    ├── T4 config.ts defineConfig          ┘
    │
    ├── T5 global-setup.ts                 (needs T2 env format)
    ├── T6 test.ts kit fixture             (needs T2 + T3)
    │
    ├── T7 package unit/integration tests  (needs T4,T5,T6)
    ├── T8 apps/browser-e2e consumer       (needs T4,T5,T6)
    │
    ├── T9 CI chromium install             (needs T8)
    └── T10 root wiring + verify + docs    (needs all)
```

Parallel waves: T2/T3/T4 in parallel; T5/T6 in parallel after T2/T3; T7/T8 in parallel
after the package sources exist; T9 after T8; T10 last.

## Task List

### Wave 0 — Contract (sequential)

- [x] T1: Scaffold `packages/test-browser` package skeleton

### Wave A — Independent modules (parallel: T2, T3, T4)

- [x] T2: `src/context.ts` kit-payload env codec + tests
- [x] T3: `src/run-context.ts` `TestInfo` adapter + tests
- [x] T4: `src/config.ts` `defineConfig` + XQ defaults + tests

### Wave B — Lifecycle and fixture (parallel: T5, T6)

- [x] T5: `src/global-setup.ts` mock + backend lifecycle
- [x] T6: `src/test.ts` `kit` fixture + `index.ts` exports

### Wave C — Proof (parallel: T7, T8)

- [x] T7: Package test suite green (`packages/test-browser/test/`)
- [x] T8: `apps/browser-e2e` private consumer app + spec

### Wave D — Ship gates (sequential)

- [x] T9: CI workflow installs Chromium for browser-e2e
- [x] T10: Root wiring, verify gates, docs

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single-file HTML reporter option name differs across peer range | Med | Verify at T4; spec has outputFolder fallback |
| Playwright does not propagate env set in globalSetup to workers | High | Verify early at T5 with a spike test before T6 depends on it; fallback = temp-file payload path |
| `pactum`/`tsx` deps irrelevant to browser tests but reused | Low | Same dep policy as `packages/test`; keep |
| `apps/browser-e2e` needs network access to GitHub Packages in CI | Med | Reuse existing publish/install auth pattern from workflows |
| Parallel slices touching shared files (root package.json, workflows) | Med | File ownership assigned per task; shared files only in T1/T9/T10 |

## Open Questions

None — spec decisions section is complete.
