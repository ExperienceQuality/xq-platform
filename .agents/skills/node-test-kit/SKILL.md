---
name: node-test-kit
description: Help consumers install and use node-test-kit for Vitest backend functional and API end-to-end tests.
---

# node-test-kit

Use this skill when setting up `node-test-kit` in a consumer Node.js repository, writing tests with its platform-owned fixtures, or configuring its mock server and typed database clients. This is the repository's dedicated agent skill for kit usage.

## Work in small BDD slices

For feature work, start with a focused Given/When/Then scenario before editing implementation:

```gherkin
Given the consumer configures a payment stub
When the application creates an order
Then the response is successful
And the payment interaction was exercised exactly once
```

Keep the test boundary consumer-facing: use the exported `test`, `expect`, and `kit` APIs. Do not reach into `packages/*/src` from a consumer test. Implement the smallest change that makes the scenario pass, then run the narrow test followed by the repository quality gates.

## Choose an installation source

Use the release channel approved by the maintainers. For a published package, install the public facade and its peer:

```bash
npm install --save-dev node-test-kit vitest
```

Pin the version used by the consumer repository when reproducibility matters. The public imports are:

```text
node-test-kit/vitest
node-test-kit/vitest/config
```

This repository currently marks its workspace packages as private. Do not claim that `npm install node-test-kit` or a GitHub URL works for an unreleased checkout. For source development, use the repository's workspace instructions (`npm ci`, then `npm run build`) or a maintainer-provided packed artifact. Recheck package metadata and release documentation before changing installation commands.

The kit requires Node.js 24 or newer and Vitest 4 or newer in the current package contract.

## Configure Vitest

Create `vitest.config.ts` in the consumer repository and keep the framework configuration as the outer config:

```ts
import { defineConfig } from 'node-test-kit/vitest/config';

export default defineConfig({
  application: {
    url: 'http://127.0.0.1:4000/health'
  },
  mock: {
    host: '127.0.0.1'
  }
});
```

The adapter starts one PactumJS mock server for the Vitest run and creates one `kit` fixture per test. Add consumer-specific Vitest options under `test` when needed; do not replace the framework global setup.

## Write tests with the platform fixture

Import the framework-owned `test` and `expect`:

```ts
import { expect, test } from 'node-test-kit/vitest';

test('creates an order', async ({ kit }) => {
  const response = await kit.rest
    .post('/orders')
    .withJson({ productId: 'product-1' })
    .expectStatus(201)
    .toss();

  expect(response.statusCode).toBe(201);
});
```

Consumers do not create a replacement test function. `kit` provides:

- `kit.rest` (and compatibility alias `kit.api`): PactumJS fluent HTTP client.
- `kit.stub`: per-test mock interaction operations and cleanup.
- `kit.db`: named database clients when configured.
- `kit.run`: test and worker metadata.

Run tests with the repository's normal Vitest command, for example:

```bash
npx vitest run
```

## Configure and use PostgreSQL clients

Declare names and environment-variable keys in `vitest.config.ts`; keep connection strings out of committed config:

```ts
export default defineConfig({
  databases: {
    orders: { urlEnv: 'ORDERS_DATABASE_URL' },
    analytics: {
      urlEnv: 'ANALYTICS_DATABASE_URL',
      defaultSchema: 'reporting',
      pool: { max: 4 }
    }
  }
});
```

Set the variables before running Vitest. Give each database name its consumer-owned schema type at lookup time:

```ts
type OrdersDatabase = {
  orders: { id: number; status: string };
};

test('reads an order', async ({ kit }) => {
  const orders = kit.db.get<OrdersDatabase>('orders');
  const order = await orders
    .selectFrom('orders')
    .selectAll()
    .executeTakeFirstOrThrow();

  expect(order.status).toBe('pending');
});
```

`kit.db.get<Database>(name)` removes a cast but cannot infer arbitrary consumer table types from runtime configuration. A database name can be looked up more than once with different local schema types when a repository has multiple databases or schemas. `defaultSchema` applies to unqualified queries for that client; use Kysely's schema APIs for more specific query routing. The framework closes its worker-scoped clients, while consumers own migrations and cleanup of rows created by tests or the application pool.

## Stub downstream services

Create interactions through `kit.stub` and assert that the application exercised them:

```ts
const payment = await kit.stub.addInteraction({
  request: {
    method: 'POST',
    path: '/payments',
    body: { productId: 'product-1' }
  },
  response: {
    status: 201,
    body: { paymentId: 'pay-123' }
  }
});

await kit.rest.post('/orders').withJson({ productId: 'product-1' }).toss();

const interaction = await kit.stub.getInteraction(payment);
expect(interaction.exercised).toBe(true);
expect(interaction.callCount).toBe(1);
```

The fixture clears interactions created by the current test during teardown. The application under test must forward the reserved `x-node-test-kit-namespace` request header to the mock server so parallel tests remain isolated. The server URL is available through the `NODE_TEST_KIT_STUB_URL` environment variable in an application process started by the kit.

## Troubleshoot setup

- A missing database variable names both the configured database and required environment variable.
- A lookup for an unknown database name fails with a not-configured error.
- If the application cannot reach a stub, verify it forwards `x-node-test-kit-namespace` and uses `NODE_TEST_KIT_STUB_URL` when the kit starts the application.
- Keep application startup, migrations, and test data cleanup in consumer-owned setup; the kit owns fixture and mock lifecycle only.

## Repository validation commands

When working in this repository, use these commands in order as appropriate:

```bash
npm test                 # unit and integration suites
npm run check            # structure, build, and workspace checks
npm run ci:cucumber      # Cucumber smoke run and HTML report verification
npm run verify:packages  # packed-package fresh-consumer verification
npm run ci:test          # full CI test gate, including Docker Compose E2E
```

The Cucumber report defaults to the consumer-relative `artifacts/index.html`. A blank or missing `reportPath` uses that fallback. A custom path must remain relative to the consumer workspace; absolute paths and `..` traversal are invalid. CI packages this report as an artifact and GitHub Pages publishes the latest successful `main` report.
