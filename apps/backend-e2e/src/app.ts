import express from 'express';
import { Pool } from 'pg';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://test:test@127.0.0.1:5432/backend_e2e'
});

app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/payments', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, order_id, amount, currency, status,
            created_at, updated_at
       FROM payments
      ORDER BY created_at DESC`
  );
  response.json(result.rows);
});

app.post('/payments', async (request, response) => {
  const body = request.body ?? {};
  const orderId = body.order_id;
  const { amount, currency, status = 'pending' } = body;

  if (
    typeof orderId !== 'string' ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    response.status(400).json({ error: 'invalid_payment' });
    return;
  }

  const result = await pool.query(
    `INSERT INTO payments (order_id, amount, currency, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, order_id, amount, currency, status, created_at, updated_at`,
    [orderId, amount, currency, status]
  );
  response.status(201).json(result.rows[0]);
});

app.post('/orders', async (request, response) => {
  const input = request.body ?? {};
  const paymentBaseUrl =
    process.env.NODE_TEST_KIT_STUB_URL ??
    process.env.PAYMENTS_URL?.replace(/\/payments$/, '');
  const payment = await fetch(`${paymentBaseUrl}/payments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-node-test-kit-namespace': request.header('x-node-test-kit-namespace') ?? ''
    },
    body: JSON.stringify({ productId: input.productId })
  });

  if (!payment.ok) {
    response.status(502).json({ error: 'payment_failed' });
    return;
  }

  const paymentBody = await payment.json();
  response.status(201).json({
    id: 'order-123',
    productId: input.productId,
    paymentId: paymentBody.paymentId,
    status: paymentBody.status
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'not_found' });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'internal_server_error' });
});

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Hello`)
});

const shutdown = () => {
  server.close(() => pool.end());
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
