// Dummy writer/reader service for the infra E2E fixture.
// One image, two roles selected by SERVICE_ROLE. Compiled to dist/services.js
// and run inside the xq-infra-e2e container. Runtime deps: pg only.
import http from 'node:http';
import crypto from 'node:crypto';
import { Pool } from 'pg';

interface Message {
  id: string;
  body: string;
}

const role = process.env.SERVICE_ROLE ?? 'unknown';
const port = Number(process.env.PORT ?? 3000);
const jobExit =
  process.env.FIXTURE_JOB_EXIT === undefined ? null : Number(process.env.FIXTURE_JOB_EXIT);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
});

function marker(): string {
  return `[infra-e2e:${role}]`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 10, delayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function handleHealth(res: http.ServerResponse): Promise<void> {
  try {
    await pool.query('SELECT 1');
    sendJson(res, 200, { status: 'ok' });
  } catch {
    sendJson(res, 503, { status: 'unavailable' });
  }
}

async function handleCreateMessage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = await readJson(req);
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }
  const body = (parsed as { body?: unknown }).body;
  if (typeof body !== 'string' || body.length === 0 || body.length > 256) {
    sendJson(res, 400, { error: 'body must be a non-empty string of at most 256 characters' });
    return;
  }
  const id = crypto.randomUUID();
  const result = await withRetry(() =>
    pool.query<Message>('INSERT INTO messages (id, body) VALUES ($1, $2) RETURNING id, body', [
      id,
      body,
    ]),
  );
  sendJson(res, 201, result.rows[0]);
}

async function handleListMessages(res: http.ServerResponse): Promise<void> {
  const result = await withRetry(() =>
    pool.query<Message>('SELECT id, body FROM messages ORDER BY id'),
  );
  sendJson(res, 200, result.rows);
}

function handleFixtureComplete(res: http.ServerResponse): void {
  const code = jobExit ?? 0;
  sendJson(res, 202, { exiting: code });
  setTimeout(() => process.exit(code), 100);
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  const method = req.method ?? '';
  void (async () => {
    if (method === 'GET' && path === '/health') {
      await handleHealth(res);
    } else if (method === 'POST' && path === '/messages' && role === 'writer') {
      await handleCreateMessage(req, res);
    } else if (method === 'GET' && path === '/messages' && role === 'reader') {
      await handleListMessages(res);
    } else if (method === 'POST' && path === '/fixture/complete' && jobExit !== null) {
      handleFixtureComplete(res);
    } else {
      sendJson(res, 404, { error: 'not found' });
    }
  })()
    .then(() => {
      console.log(`${marker()} ${method} ${path} ${res.statusCode}`);
    })
    .catch((error: unknown) => {
      console.error(`${marker()} ${method} ${path} failed`, error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal error' });
      } else {
        res.end();
      }
    });
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${marker()} ${signal} received, shutting down`);
  server.close();
  try {
    await pool.end();
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

server.listen(port, () => {
  console.log(`${marker()} listening on :${port} (jobExit=${jobExit === null ? 'off' : jobExit})`);
});
