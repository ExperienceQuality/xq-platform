import { existsSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  SEED_MESSAGE,
  adjustGatewayPort,
  assertCleanProject,
  buildImage,
  captureResources,
  cleanupDbVolume,
  cliLogs,
  createRun,
  down,
  ensureDocker,
  fetchJson,
  gatewayBaseUrl,
  generate,
  pollGateway,
  pullBaseImages,
  record,
  up,
  upAsync,
  verifyProjectGone,
  type RunContext,
} from '../src/lifecycle.js';

interface Message {
  id: string;
  body: string;
}

async function prepareProject(run: RunContext): Promise<void> {
  await buildImage(run);
  await generate(run);
  await adjustGatewayPort(run);
  await assertCleanProject(run);
}

async function teardown(run: RunContext): Promise<void> {
  if (!existsSync(run.composeFile)) return; // generate never ran; nothing exists
  const resources = await captureResources(run);
  const services = Object.keys(resources.containers).sort();
  if (services.length > 0) {
    expect(services).toEqual(['postgres', 'reader', 'writer', 'xq-gateway', 'xq-wiremock']);
  }
  const downResult = await down(run);
  expect(downResult.exitCode).toBe(0);
  await verifyProjectGone(run);
  await cleanupDbVolume(run, resources.dbVolume);
}

beforeAll(async () => {
  await ensureDocker();
  await pullBaseImages();
});

describe.sequential('xq-infra real-Docker lifecycle', () => {
  it('generate/up/gateway round-trip/logs/down across 4 containers', async () => {
    const run = await createRun();
    try {
      await prepareProject(run);

      const upResult = await up(run);
      expect(upResult.exitCode).toBe(0);
      expect(upResult.stdout).toContain('Services started successfully!');

      const base = await pollGateway(run, '/writer/health');
      expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      // Service-name fallback routes through the gateway
      for (const pathName of ['/writer/health', '/reader/health']) {
        const health = await fetchJson(`${base}${pathName}`);
        expect(health.status).toBe(200);
        expect(health.body).toEqual({ status: 'ok' });
      }

      // Seed row visible through gateway -> reader
      const initial = await fetchJson(`${base}/messages`);
      expect(initial.status).toBe(200);
      expect(initial.body).toEqual([SEED_MESSAGE]);

      // Gateway POST -> writer -> shared postgres -> gateway GET -> reader
      const body = `e2e-${run.runId}`;
      const created = await fetchJson(`${base}/messages`, {
        method: 'POST',
        body: { body },
      });
      expect(created.status).toBe(201);
      const createdMessage = created.body as Message;
      expect(createdMessage.body).toBe(body);
      expect(createdMessage.id).toMatch(/^[0-9a-f-]{36}$/);

      const after = (await fetchJson(`${base}/messages`)).body as Message[];
      expect(after).toContainEqual(SEED_MESSAGE);
      expect(after).toContainEqual(createdMessage);

      // Method routing: GET /messages must not hit writer-only handling
      const wrongMethod = await fetchJson(`${base}/messages`, { method: 'DELETE' });
      expect([404, 405]).toContain(wrongMethod.status);

      const logs = await cliLogs(run);
      expect(logs.exitCode).toBe(0);
      expect(logs.stdout).toContain('[infra-e2e:writer]');
      expect(logs.stdout).toContain('[infra-e2e:reader]');
    } finally {
      await teardown(run);
    }
  });

  it.each([
    { jobExit: 0, cliExit: 0 },
    { jobExit: 7, cliExit: 1 },
  ])('test container exit $jobExit surfaces CLI exit $cliExit', async ({ jobExit, cliExit }) => {
    const run = await createRun(jobExit);
    try {
      await prepareProject(run);

      const upResultPromise = upAsync(run);
      void upResultPromise.catch(() => undefined); // handled via await below
      const base = await pollGateway(run, '/writer/health');

      const armed = await fetchJson(`${base}/fixture/complete`, { method: 'POST' });
      expect(armed.status).toBe(202);
      expect(armed.body).toEqual({ exiting: jobExit });

      const upResult = await upResultPromise;
      await record(run, 'up', upResult);
      expect(upResult.exitCode).toBe(cliExit);
    } finally {
      await teardown(run);
    }
  });
});
