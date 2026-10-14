# Node Test Kit API

Node Test Kit is a private npm workspace for Vitest backend and API E2E tests. Consumer packages are `@experiencequality/test`, `@experiencequality/core`, `@experiencequality/rest-client`, `@experiencequality/stub`, and `@experiencequality/db`. Runtime requires Node 24+ and Vitest 4+.

## Quick start

```ts
// vitest.config.ts
import { defineConfig } from '@experiencequality/test/vitest/config';

export default defineConfig({
  application: { command: 'pnpm run start', url: 'http://127.0.0.1:4000/health' },
  mock: { host: '127.0.0.1' },
  databases: { app: { urlEnv: 'DATABASE_URL', defaultSchema: 'public' } },
});
```

```ts
import { expect, test } from '@experiencequality/test/vitest';

test('creates a routine', async ({ kit }) => {
  const interaction = await kit.stub.addInteraction({
    request: { method: 'GET', path: '/users/user-1' },
    response: { status: 200, body: { id: 'user-1' } },
  });

  await kit.rest
    .post('/routines')
    .withJson({ name: 'Strength A', userId: 'user-1' })
    .expectStatus(201);

  expect(kit.run.testId).toBeTypeOf('string');
  await kit.stub.removeInteraction(interaction);
});
```

`@experiencequality/test/vitest` creates one isolated run context per test, clears that test's stub interactions after it, and closes worker-scoped database clients. `@experiencequality/test/vitest/config` starts the configured mock server and optional backend in global setup.

## `@experiencequality/test`

- `@experiencequality/test/vitest` exports Vitest `expect`, extended `test`, and `NodeTestKit`.
- `@experiencequality/test/vitest/config` exports `defineConfig(options?)` and `NodeTestKitConfig`.
- `KitOptions.application` is `BackendOptions`; `databases` is `DatabaseOptions`; `mock` is `PactumServerOptions`.
- `kit` contains `api` and `rest` clients, `stub`, `run`, and `db`.

The default test include is `test/**/*.test.{js,mjs,ts,mts}`, environment is `node`, tests are isolated, file parallelism is enabled, and max concurrency is one. User global setup runs after kit setup.

## `@experiencequality/core`

- `createRunContext(task?, metadata?)` creates a frozen context with random `id`, `testId`, `workerId`, `backendUrl`, and mock metadata.
- `createKit(run)` returns frozen `{ api, rest, stub, run }`.
- `startBackend(options)` starts a shell command, polls its URL until status is below 500, and returns `{ url, stop() }`.
- `BackendOptions`: `command`, `url`, optional `cwd`, `timeout` (default 30s), and `env` overrides.
- `BackendProcess`, `MockMetadata`, `RunContext`, and `Kit` are exported types.

Missing command/URL, early process exit, and readiness timeout throw `node-test-kit:` errors. `stop()` sends SIGTERM while the process is live.

## `@experiencequality/rest-client`

- `createRestClient(options)` returns a `RestClient`.
- `RestClient` methods: `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `trace`; each accepts a service-relative path and returns a Pactum spec.
- `RestClientOptions`: `baseUrl`, `namespaceHeader`, and `namespace`.
- `PactumSpec` is the inferred Pactum spec type.
- `RestCapture` contains captured `request`, optional `response`, and optional `error`.

The client resolves paths against `baseUrl`, adds the namespace header, and captures request/response events in `client.captures`. A missing base URL throws `node-test-kit: backend URL is not configured`.

```ts
await kit.rest.get('/health').expectStatus(200);
await kit.rest.post('/routines').withJson({ name: 'Strength A' }).expectStatus(201);
```

## `@experiencequality/stub`

- `startPactumServer(options?)` starts a local Pactum server and returns `PactumServer`.
- `new StubClient(options)` is preferred; `createStubClient(options)` remains supported.
- `NAMESPACE_HEADER` is the default isolation header.
- `PactumServerOptions`: optional `host`, `port`, `attempts`, and `healthTimeout`.
- `PactumServer`: `host`, `port`, `url`, `managementUrl`, `namespaceHeader`, and idempotent async `stop()`.
- `StubClientOptions`: `baseUrl`, `namespace`, and optional `namespaceHeader`.
- `addInteraction`, `getInteraction`, `removeInteraction`, and `clearInteractions` manage owned interactions.
- `verifyRequest`, `getCallCount`, `verifyCallCount`, `verifyCalled`, `verifyNotCalled`, and `verifyNoUnexpectedInteractions` provide generic request and mutation assertions.
- `PactumInteraction` and `PactumInteractionDetails` are exported Pactum types.

Clients own only interactions they add. Other IDs cannot be read or removed. Namespace headers are injected and cannot be overridden with another value.

```ts
const id = await kit.stub.addInteraction({
  request: { method: 'GET', path: '/health' },
  response: { status: 200, body: { ok: true } },
});
await kit.rest.get('/health').expectStatus(200);
await kit.stub.removeInteraction(id);
```

## `@experiencequality/db`

- `createDatabaseClients(descriptors, environment?)` creates named Kysely clients.
- `destroyDatabaseClients(clients)` closes all pools and reports close failures.
- `sql` is Kysely's SQL helper.
- `DatabaseDescriptor`: `urlEnv`, optional `defaultSchema`, and pool settings `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `allowExitOnIdle`.
- `DatabaseOptions` maps names to descriptors.
- `DatabaseClients.get<Database>(name)` returns a typed Kysely client.
- Kysely types `ColumnType`, `Generated`, `GeneratedAlways`, `Insertable`, `Selectable`, `Updateable`, and `Kysely` are re-exported.

Each descriptor first reads the environment variable named by its `urlEnv`; `DATABASE_URL` is the fallback when that descriptor-specific variable is absent. This precedence allows named clients to use different databases while retaining the single-database default. Missing configuration and unknown names throw explicit `node-test-kit:` errors.

```ts
const db = createDatabaseClients({ app: { urlEnv: 'APP_DATABASE_URL', defaultSchema: 'public' } });
try {
  const rows = await db
    .get<{ routines: { id: string } }>('app')
    .selectFrom('routines')
    .select('id')
    .execute();
} finally {
  await destroyDatabaseClients(db);
}
```

## Cucumber subpaths

`@experiencequality/test` also exposes Cucumber integration:

- `@experiencequality/test/cucumber/config` exports `defineCucumberConfig`, which adds the kit register/bootstrap imports and plugin.
- `@experiencequality/test/cucumber` exports `XqWorld`, `composeJsonTable`, `assertJsonTable`, `expectJsonTable`, and `registerJsonTableExpectation`, plus scenario and table option types.
- `@experiencequality/test/cucumber/register`, `/bootstrap`, and `/plugin` are configuration entry points used by `defineCucumberConfig`.
- `@experiencequality/test/cucumber/json` exports JSON-table composition helpers.
- Cucumber bootstrap starts one local Pactum server by default, exposes `XQ_TEST_STUB_URL`, creates a namespaced `world.stub`, and clears that world's interactions after each scenario.
- `XQ_TEST_STUB_ENABLED=false` disables automatic startup; `XQ_TEST_STUB_URL` selects an external server; `XQ_TEST_STUB_PORT` selects a fixed local port. A step can call `await this.requireStub()` for explicit opt-in when disabled.

Configure feature paths and step imports through `defineCucumberConfig({ paths, steps })`. The API always enables `progress` plus a standalone HTML report at `artifacts/index.html`; set `reportPath` to customize its output path. `CUCUMBER_REPORT_PATH` exports the default path for CI packaging and GitHub Pages publishing. JSON table headers support dotted object paths and indexed array paths; malformed, duplicate, conflicting, or sparse paths fail with `xq-test:` errors.

## Environment and boundaries

- `NODE_TEST_KIT_BACKEND_URL` supplies a backend URL when metadata has none.
- `NODE_TEST_KIT_STUB_URL` supplies a stub URL when mock metadata has none.
- `XQ_TEST_STUB_ENABLED`, `XQ_TEST_STUB_URL`, and `XQ_TEST_STUB_PORT` configure the Cucumber stub lifecycle.
- `VITEST_WORKER_ID` or `VITEST_POOL_ID` supplies worker identity.
- The kit does not own deployment, migrations, or consumer payload builders.
- Keep secrets in the process environment, not committed config.

## Verification

```bash
pnpm run check
pnpm test
pnpm run verify:structure
pnpm run verify:packages
```
