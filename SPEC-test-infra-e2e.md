# Spec: Real-Docker verification for @experiencequality/test-infra

**Status:** Approved and verified — `pnpm run test:e2e:infra` passed 3/3 on local Docker 29.7.2 / Compose v5.4.0 / Node 24 (2026-10-25): 4-container gateway round-trip, job exit `0` → CLI `0`, job exit `7` → CLI `1`, scoped `down` + volume cleanup confirmed, zero leftovers. `SPEC-test-infra.md` remains the migration spec; this document's demo scope applies **only** to `apps/infra-e2e/`.

## 1. Objective

Prove the compiled `xq-infra` CLI end-to-end against a real Docker daemon: `generate`, `up`, `logs`, and `down` over a disposable four-service compose project built from a dummy writer/reader/PostgreSQL fixture **including the generated `xq-gateway`**. This is verification scope, not a product feature.

## 2. Workspace app

- New private app `apps/infra-e2e/`, name `@experiencequality/showcase-infra-e2e`, Node `>=24`, strict TypeScript ESM, Vitest 4 host-side test runner, dev-dependency on workspace `@experiencequality/test-infra` (the compiled `xq-infra` bin under test).
- Never published; existing seven packages' APIs/source untouched; structure-verifier private-app discovery updated to allow the new app; no new CI workflow; tests opt-in via `test:e2e:infra` only — not in `pnpm test` or package unit checks.

## 3. Fixture (exactly 4 containers, gateway included)

- `postgres` — `postgres:16-alpine` (matches existing backend-e2e), local fake credentials only, **no host port**; `pg_isready` healthcheck so the generated gateway `depends_on` carries `service_healthy`.
- `writer` and `reader` — two roles of the **same** locally built dummy Node image (`xq-infra-e2e:<runUUID>`), separate processes/containers, HTTP on container port `3000` via source `ports: ['127.0.0.1::3000']` (dynamic loopback bindings kept for diagnostics only). Real DB healthchecks so generated gateway `depends_on` carries `service_healthy`.
- `writer`: `POST /messages` `{body: string}` — validates non-empty, max 256 — `INSERT INTO messages(id, body) VALUES($1,$2) RETURNING id, body` parameterized with `crypto.randomUUID()`; `201 {id, body}`.
- `reader`: `GET /messages` → `200` ordered array (`ORDER BY id`).
- Both: `GET /health` runs `SELECT 1` — `200 {status:'ok'}` when ready, `503` otherwise.
- `xq-gateway` — **generated**, not authored: the default gateway path emits `nginx:alpine` with the generated `nginx-gateway.conf` mounted read-only.
- Route declarations in the service specs: writer `routes: [{methods: ['POST'], paths: ['/messages']}]`, reader `routes: [{methods: ['GET'], paths: ['/messages']}]`. The generated config must encode the method/path rules; the `/writer/health` and `/reader/health` service-name fallback routes are also verified through the gateway.
- `fixtures/init.sql` (read-only mount): `CREATE TABLE messages(id UUID PRIMARY KEY, body TEXT NOT NULL)` + one seed `00000000-0000-4000-8000-000000000001`/`'baseline'`; anonymous volume owned by the run's container.

```ts
interface Message {
  id: string;
  body: string;
}
```

## 4. Source layout

`apps/infra-e2e/`: `package.json`, `README.md`, `tsconfig.json`, `vitest.config.ts`, `src/services.ts` (role from env: writer|reader), `src/lifecycle.ts` (real-CLI runner), `test/lifecycle.test.ts`, `fixtures/init.sql`, `services/{postgres,writer,reader}.service.yml` + `services/xq.config.yml`, `Dockerfile`, `.dockerignore`. Image installs only public `pg` runtime dep (`pg@^8` matching the workspace's pg line); no `.npmrc`, secrets, host `node_modules`, or workspace links inside the image; container-only manifests/locks stay in the build context.

## 5. Build/generate flow

The source generator emits `image`/`tag` but **no** `build:` support — the runner builds the local image **first**, then injects a run-unique image tag into a **copied** YAML spec. Generate runs with the **default gateway** (no `--no-gateway`). All compose work runs in a per-run `mkdtemp` cwd; the host never uses the package root's compose files.

The generator hardcodes the gateway image `nginx:alpine` and host port `8080` (or the next spec port) — there is no gateway-port option and none is added. Before startup, the runner validates the _generated_ gateway image/config/health-dependency shape, then makes a single fixture-only adjustment to the generated compose: `xq-gateway.ports` becomes `['127.0.0.1::80']` (Docker random host port). Writer/reader source ports `['127.0.0.1::3000']` stay as generated, so nginx upstream extraction still resolves port `3000`. Generated routes, health dependencies, and the network are preserved; the package runtime is unchanged. Both the original and effective compose configs are captured as evidence with the exact one-port remap recorded. The gateway address is discovered via `docker compose ... port xq-gateway 80`.

## 6. Isolation and ownership

- `mkdtemp` per run + run UUID marker; `COMPOSE_PROJECT_NAME=xq-infra-e2e-<uuid>` fixed for subprocesses and compose checks.
- Refuse to proceed if the project name/containers preexist; no `container_name`, no shared-data bind mounts.
- `services/*.service.yml` copied into the run dir; readiness via bounded health poll (≤120 s, 5 s request timeouts) plus service DB retry — no runtime package changes.
- Record container IDs (all four, including the gateway), compose project labels, and DB volume IDs **before** `down`; verify they belong to this run and, for the DB volume, mount only to this run's postgres.
- Fresh service instances close HTTP server/pg pool on `SIGTERM`.

## 7. Test story

1. `generate -f <run>/services` via the compiled bin (gateway default); validate compose config — generated `xq-gateway` image, mounted conf, `service_healthy` dependencies, and the method/path route rules.
2. `up --no-pull` (prebuilt/cached images); bounded health poll through the gateway; the seed row is visible.
3. **Gateway data flow — primary proof:** host → gateway `POST /messages` routes to writer; host → gateway `GET /messages` routes to reader and returns the same `id`/`body` plus the seed (real shared-DB proof through the gateway, not direct service access). All application assertions go through the gateway; the `127.0.0.1` service ports are diagnostics only.
4. Fallback routes: `GET` gateway `/writer/health` and `/reader/health` hit the service-name fallback and return `200`.
5. `logs --tail 20` includes role markers.
6. `down` removes only this run's four containers/network; verify none remain.
7. Test-container scenario: copy the writer service file as `writer.test.service.yml` with an explicit `name: writer`; the process **still runs the healthy HTTP server** (no early exit — that would break the gateway's `service_healthy` dependency and surface exit 3 instead of the test status). `FIXTURE_JOB_EXIT=0|7` arms a job-mode-only `POST /fixture/complete` endpoint, routed via the gateway to writer. `up` starts asynchronously; once gateway and services are healthy, the host POSTs `/fixture/complete`, and the writer exits with the configured code **only after** flushing the response. The CLI's test-container wait returns `0` on pass, `1` on failure. The control endpoint does not exist outside job mode; no sleep-based early exit, no removed healthcheck, no extra runner — still exactly 4 containers, all real, no mocks.
8. Explicit `test:e2e:infra` fails if Docker is unavailable — no silent skip passes.

## 8. Required permissions (approval scope)

Read-only: `docker info`, `docker compose version`. Pull: separate `docker pull node:24-alpine`, `docker pull postgres:16-alpine`, and `docker pull nginx:alpine` commands. Build: `docker build -t xq-infra-e2e:<runUUID> <owned-context>`. Runtime: only via the compiled `xq-infra` under the unique project. Ownership and port checks use `docker compose -p "$RUN_PROJECT" -f "$RUN_DIR/xq-compose.yml" ps --all --quiet`, `docker compose -p "$RUN_PROJECT" -f "$RUN_DIR/xq-compose.yml" port xq-gateway 80` (plus optional `port <service> 3000` diagnostics), `docker inspect <captured-container-id>`, and `docker volume inspect "$RUN_DB_VOLUME"`. **Destructive — needs approval:** CLI `down` (scoped to this project, covering all four containers including the gateway), plus `docker volume rm "$RUN_DB_VOLUME"` only after the captured ID is proven to belong solely to this run's postgres with no other references; fallback direct `compose down` only on the same owned project if the CLI fails. **Never:** volume/image/system prune, shared-volume deletion, `--remove-orphans` outside the CLI's own `up`, arbitrary `rm` of run-dir data, or removal of built/base images. If ownership cannot be proven, refuse cleanup and report the resource IDs.

## 9. Success criteria

- All lifecycle tests pass on an explicit `pnpm run test:e2e:infra` invocation; shared-DB write/read round-trip proven **through the gateway** with real containers (method/path routes and service-name fallbacks verified).
- Every created resource is scoped to the unique project — all four containers, network, and the DB volume; post-run state shows no leftovers; evidence (stdout/stderr, original + effective compose configs, health checks, resource IDs) captured before cleanup.
- Existing packages and apps untouched; no secrets anywhere; upstream repository unmodified.

## 10. Assumptions (for approval)

- Writer/reader are role variants of one dummy image; exactly 4 containers: writer, reader, postgres, and the generated `xq-gateway`.
- The gateway's hardcoded image/port come from the generated output; the only fixture adjustment is the `xq-gateway.ports` → `127.0.0.1::80` remap described in §5 — no package runtime changes.
- Unique compose project + scoped cleanup approval per §8 is the only destructive grant; downloaded base images (including `nginx:alpine`) are kept. The gateway amendment itself grants no cleanup approval.
- Existing dependency-download approval continues to apply; no registry login, publish, or commits are part of this spec.
