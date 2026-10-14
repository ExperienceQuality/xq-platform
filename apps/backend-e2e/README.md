# Express + PostgreSQL example

Small Express API backed by PostgreSQL. Docker Compose starts PostgreSQL and
loads [`init.sql`](./init.sql), which creates and seeds the `payments` table.

## Express basics

Express application flow is small:

```ts
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.listen(4000, '127.0.0.1');
```

- `express()` creates the application.
- `app.use(...)` registers middleware. `express.json()` parses JSON request bodies.
- `app.get(...)` and `app.post(...)` register HTTP routes.
- `request.params`, `request.query`, and `request.body` read input.
- `response.json(...)` sends JSON. Set status with `response.status(201)` first.
- Register 404 and error middleware after routes.

Keep route handlers focused: validate input, call a service or database, then
send one response. Use `async` handlers for database work.

## PostgreSQL connection

This example uses `pg` and one connection pool for the process:

```ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const result = await pool.query(
  'SELECT * FROM payments WHERE status = $1',
  ['captured']
);

await pool.end();
```

Use parameter placeholders (`$1`, `$2`, ...) for user input. Never concatenate
request values into SQL. A pool reuses database connections; do not create a
new `Pool` inside each request.

For long-running applications, close the pool during shutdown:

```ts
process.once('SIGTERM', () => pool.end());
```

`DATABASE_URL` format:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

The app uses the local Compose URL when `DATABASE_URL` is missing.

## Run

```bash
docker compose up -d
npm test
```

Start the API directly:

```bash
DATABASE_URL=postgresql://test:test@127.0.0.1:5432/backend_e2e \
  node --experimental-strip-types src/app.ts
```

## Routes

- `GET /health` returns `{ "status": "ok" }`.
- `GET /payments` lists payments from PostgreSQL.
- `POST /payments` creates a payment. Amount uses minor currency units.
- `POST /orders` demonstrates an order calling the `@experiencequality/test` payment stub.

Example payment request:

```bash
curl -X POST http://127.0.0.1:4000/payments \
  -H 'content-type: application/json' \
  -d '{"order_id":"order-1004","amount":1999,"currency":"USD"}'
```

`DATABASE_URL` is optional. Without it, the app uses the local Compose
connection shown above.
